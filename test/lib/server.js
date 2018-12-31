const request = require('request-promise-native')
const createApp = require('../../index.js')
const util = require('./util')

var portCounter = 10000

module.exports = function (cb) {
  if (process.env.REMOTE_URL) {
    return createRemoteApp(cb)
  } else {
    return createLocalApp(cb)
  }
}

function createRemoteApp (cb) {
  var url = process.env.REMOTE_URL
  console.log(`connecting to ${url}`)
  var app = {
    url,
    isRemote: true,
    req: request.defaults({ baseUrl: url, timeout: 10e3, resolveWithFullResponse: true, simple: false }),
    close: cb => cb()
  }
  cb(null, app)
}

async function createLocalApp (cb) {
  // setup config
  // =

  var tmpdir = util.mktmpdir()
  var config = {
    hostname: 'test.local',
    dir: tmpdir,
    port: portCounter++,
    defaultDiskUsageLimit: '100mb',
    defaultNamedArchivesLimit: 3,
    bandwidthLimit: {up: '600kb', down: '600kb'},
    pm2: false,
    admin: {
      password: 'foobar'
    },
    jobs: {
      popularArchivesIndex: '15m',
      userDiskUsage: '30m',
      deleteDeadArchives: '30m'
    },
    registration: {
      open: true,
      reservedNames: ['reserved', 'blacklisted']
    },
    email: {
      transport: 'mock',
      sender: '"Test Server" <noreply@test.local>'
    },
    cache: {
      metadataStorage: 65536,
      contentStorage: 65536,
      tree: 65536
    },
    sessions: {
      algorithm: 'HS256',
      secret: 'super secret',
      expiresIn: '1h'
    },
    proofs: {
      algorithm: 'HS256',
      secret: 'super secret 2'
    },
    stripe: {
      secretKey: 'foo',
      publishableKey: 'bar'
    }
  }

  // create server
  // =

  var app = await createApp(config)
  var server = app.listen(config.port, (err) => {
    if (!err) console.log(`server started on http://127.0.0.1:${config.port}`)
    cb(err, app)
  })

  app.isRemote = false
  app.url = `http://127.0.0.1:${config.port}`
  app.req = request.defaults({
    baseUrl: app.url,
    resolveWithFullResponse: true,
    simple: false
  })

  // wrap app.close to stop the server
  var orgClose = app.close
  app.close = cb => orgClose.call(app, () => server.close(cb))

  return app
}
