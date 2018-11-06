const nicedate = require('nicedate')
const bytes = require('bytes')
const {ForbiddenError} = require('../const')
const {pluralize, ucfirst} = require('../helpers')

// exported api
// =

class PagesAPI {
  constructor (cloud) {
    this.cloud = cloud
    this.config = cloud.config
  }

  async frontpage (req, res) {
    var user = res.locals.sessionUser
    var diskUsage = user ? user.diskUsage : undefined
    var diskQuota = user ? this.config.getUserDiskQuota(user) : undefined
    var diskUsagePct = user ? this.config.getUserDiskQuotaPct(user) * 100 : undefined

    var [featured, popular] = await Promise.all([
      this.cloud.featuredArchivesDB.list(),
      (user && user.scopes.includes('admin:dats'))
        ? this.cloud.archivesDB.list({
          sort: 'popular',
          limit: 25
        })
        : false
    ])
    var userArchives = []
    if (user) {
      userArchives = await Promise.all(user.archives.map(async (record) => {
        var archive = this.cloud.archiver.archives[record.key]
        if (archive) {
          record.manifest = await this.cloud.archiver.getManifest(archive.key)
          record.title = record.manifest ? record.manifest.title : false
          record.numPeers = archive.numPeers
          record.diskUsage = await this.cloud.archiver.getArchiveDiskUsage(archive.key)
          return record
        }
      }))
      userArchives = userArchives.filter(Boolean)
    }

    let peerCount = 0
    if (userArchives.length) {
      peerCount = userArchives
        .map(a => a.numPeers)
        .reduce((sum, val) => sum + val)
    }

    res.render('frontpage', {
      verified: req.query.verified,
      userArchives,
      nicedate,
      featured,
      popular,
      bytes,
      diskUsage,
      diskUsagePct,
      diskQuota,
      peerCount
    })
  }

  async explore (req, res) {
    if (req.query.view === 'activity') {
      return res.render('explore-activity', {
        nicedate,
        activityLimit: 25,
        activity: await this.cloud.activityDB.listGlobalEvents({
          limit: 25,
          lt: req.query.start,
          reverse: true
        })
      })
    }
    var users = await this.cloud.usersDB.list()
    res.render('explore', {users})
  }

  async newArchive (req, res) {
    var {session, sessionUser} = res.locals
    if (!session || !sessionUser) return res.redirect('/login?redirect=new-archive')

    res.render('new-archive', {
      diskUsage: (sessionUser.diskUsage / (1 << 20)) | 0,
      diskQuota: (this.config.getUserDiskQuota(sessionUser) / (1 << 20)) | 0,
      csrfToken: req.csrfToken()
    })
  }

  about (req, res) {
    res.render('about')
  }

  pricing (req, res) {
    res.render('pricing')
  }

  terms (req, res) {
    res.render('terms')
  }

  privacy (req, res) {
    res.render('privacy')
  }

  acceptableUse (req, res) {
    res.render('acceptable-use')
  }

  support (req, res) {
    res.render('support')
  }

  login (req, res) {
    if (res.locals.session) {
      return res.redirect('/account')
    }

    res.render('login', {
      reset: req.query.reset, // password reset
      csrfToken: req.csrfToken()
    })
  }

  forgotPassword (req, res) {
    res.render('forgot-password', {
      csrfToken: req.csrfToken()
    })
  }

  resetPassword (req, res) {
    // basic check for nonce and username queries
    if (!(req.query.nonce && req.query.username)) throw new ForbiddenError()

    res.render('reset-password', {
      csrfToken: req.csrfToken()
    })
  }

  register (req, res) {
    if (res.locals.session) {
      if (req.query.pro) {
        res.redirect('/account/upgrade')
      } else {
        res.redirect('/account')
      }
      return
    }

    res.render('register', {
      isOpen: this.config.registration.open,
      isProSignup: req.query.pro,
      csrfToken: req.csrfToken()
    })
  }

  registerPro (req, res) {
    if (res.locals.session) {
      return res.redirect('/account')
    }

    // basic check for user ID and email
    if (!(req.query.id && req.query.email)) throw new ForbiddenError()

    res.render('register-pro', {
      id: req.query.id,
      email: req.query.email,
      salesTax: this.config.stripe ? this.config.stripe.salesTaxPct : null,
      csrfToken: req.csrfToken()
    })
  }

  registered (req, res) {
    res.render('registered', {email: req.query.email})
  }

  async profileRedirect (req, res) {
    var {sessionUser} = res.locals
    if (sessionUser) {
      res.redirect(`/${sessionUser.username}`)
    } else {
      res.redirect('/login?redirect=profile')
    }
  }

  async account (req, res) {
    var {session, sessionUser} = res.locals
    if (!session) return res.redirect('/login?redirect=account')

    var diskUsage = sessionUser ? sessionUser.diskUsage : undefined
    var diskQuota = sessionUser ? this.config.getUserDiskQuota(sessionUser) : undefined

    res.render('account', {
      updated: req.query.updated,
      ucfirst,
      pluralize,
      bytes,
      diskUsage,
      diskQuota,
      diskUsagePct: (this.config.getUserDiskQuotaPct(sessionUser) * 100) | 0,
      csrfToken: req.csrfToken()
    })
  }

  async accountUpgrade (req, res) {
    var {session} = res.locals
    if (!session) return res.redirect('/login?redirect=account/upgrade')
    res.render('account-upgrade', {
      salesTax: this.config.stripe ? this.config.stripe.salesTaxPct : null,
      csrfToken: req.csrfToken()
    })
  }

  async accountUpgraded (req, res) {
    var {session} = res.locals
    if (!session) throw new ForbiddenError()
    res.render('account-upgraded')
  }

  async accountCancelPlan (req, res) {
    var {session} = res.locals
    if (!session) throw new ForbiddenError()
    res.render('account-cancel-plan', {
      csrfToken: req.csrfToken()
    })
  }

  async accountCanceledPlan (req, res) {
    var {session} = res.locals
    if (!session) throw new ForbiddenError()
    res.render('account-canceled-plan')
  }

  async accountChangePassword (req, res) {
    res.render('account-change-password', {
      csrfToken: req.csrfToken()
    })
  }

  accountUpdateEmail (req, res) {
    var {session} = res.locals
    if (!session) throw new ForbiddenError()
    res.render('account-update-email', {
      csrfToken: req.csrfToken()
    })
  }
}

module.exports = PagesAPI
