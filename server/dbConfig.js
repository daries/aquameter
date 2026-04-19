const fs = require('fs')
const path = require('path')

// DATA_DIR env var dipakai saat deploy Docker agar data persisten di volume
const DATA_DIR            = process.env.DATA_DIR || __dirname
const CONFIG_PATH         = path.join(DATA_DIR, 'db-config.json')
const DEFAULT_SQLITE_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'aquameter.db')

const DEFAULT_MYSQL_PROFILE   = { engine: 'mysql',    host: '127.0.0.1', port: 3306, user: '', password: '', database: 'aquameter', ssl: false }
const DEFAULT_MARIADB_PROFILE = { engine: 'mariadb',  host: '127.0.0.1', port: 3306, user: '', password: '', database: 'aquameter', ssl: false }
const DEFAULT_PG_PROFILE      = { engine: 'postgres', host: '127.0.0.1', port: 5432, user: '', password: '', database: 'aquameter', ssl: false }

const DEFAULT_CONFIG = {
  activeEngine: 'sqlite',
  profiles: {
    sqlite:   { engine: 'sqlite', filename: DEFAULT_SQLITE_PATH },
    mysql:    DEFAULT_MYSQL_PROFILE,
    mariadb:  DEFAULT_MARIADB_PROFILE,
    postgres: DEFAULT_PG_PROFILE,
  },
}

function ensureConfigShape(raw = {}) {
  return {
    activeEngine: raw.activeEngine || DEFAULT_CONFIG.activeEngine,
    profiles: {
      sqlite:   { ...DEFAULT_CONFIG.profiles.sqlite,   ...(raw.profiles?.sqlite   || {}) },
      mysql:    { ...DEFAULT_CONFIG.profiles.mysql,    ...(raw.profiles?.mysql    || {}) },
      mariadb:  { ...DEFAULT_CONFIG.profiles.mariadb,  ...(raw.profiles?.mariadb  || {}) },
      postgres: { ...DEFAULT_CONFIG.profiles.postgres, ...(raw.profiles?.postgres || {}) },
    },
  }
}

function loadDbConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
      return ensureConfigShape(DEFAULT_CONFIG)
    }
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    const config = ensureConfigShape(raw)
    return config
  } catch (error) {
    console.error('Gagal membaca db-config.json:', error.message)
    return ensureConfigShape(DEFAULT_CONFIG)
  }
}

function saveDbConfig(nextConfig) {
  const config = ensureConfigShape(nextConfig)
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  return config
}

const REMOTE_ENGINES = ['mysql', 'mariadb', 'postgres']

function maskProfile(p) {
  return { ...p, password: p.password ? '••••••••' : '' }
}

function getSafeDbConfig() {
  const config = loadDbConfig()
  return {
    activeEngine: config.activeEngine,
    profiles: {
      sqlite:   { ...config.profiles.sqlite },
      mysql:    maskProfile(config.profiles.mysql),
      mariadb:  maskProfile(config.profiles.mariadb),
      postgres: maskProfile(config.profiles.postgres),
    },
  }
}

function mergeDbConfig(input = {}) {
  const current = loadDbConfig()
  const normalizePassword = (engine) => {
    const nextPassword = input.profiles?.[engine]?.password
    if (nextPassword === '••••••••' || nextPassword == null) {
      return current.profiles[engine]?.password || ''
    }
    return nextPassword
  }
  const next = ensureConfigShape({
    ...current,
    ...input,
    profiles: {
      ...current.profiles,
      ...(input.profiles || {}),
      sqlite:   { ...current.profiles.sqlite,   ...(input.profiles?.sqlite   || {}) },
      mysql:    { ...current.profiles.mysql,    ...(input.profiles?.mysql    || {}), password: normalizePassword('mysql') },
      mariadb:  { ...current.profiles.mariadb,  ...(input.profiles?.mariadb  || {}), password: normalizePassword('mariadb') },
      postgres: { ...current.profiles.postgres, ...(input.profiles?.postgres || {}), password: normalizePassword('postgres') },
    },
  })

  if (!['sqlite', 'mysql', 'mariadb', 'postgres', 'postgresql'].includes(next.activeEngine)) {
    throw new Error('Engine database tidak valid')
  }

  next.profiles.sqlite.filename = next.profiles.sqlite.filename || DEFAULT_SQLITE_PATH
  for (const eng of REMOTE_ENGINES) {
    next.profiles[eng].port = Number(next.profiles[eng].port || (eng === 'postgres' ? 5432 : 3306))
    next.profiles[eng].ssl  = Boolean(next.profiles[eng].ssl)
  }

  return saveDbConfig(next)
}

module.exports = {
  CONFIG_PATH,
  DEFAULT_SQLITE_PATH,
  loadDbConfig,
  saveDbConfig,
  getSafeDbConfig,
  mergeDbConfig,
}
