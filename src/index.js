
import request from 'request'
import MetaInpector from 'node-metainspector'
import { load } from 'cheerio'

module.exports = (payload, callback) => new FBG(payload, callback)

class FBG {
  constructor (cookie = {}) {
    const { uid, xs, gid } = cookie

    if (!uid) throw new Error('uid is required')
    if (!xs) throw new Error('xs is required')

    this.uid = uid
    this.xs = xs
    if (gid) this.gid = gid
    this.cookie = `c_user=${this.uid}; xs=${this.xs}`
  }

  _r (payload, cb) {
    if (!cb) cb = payload

    request({
      uri: this.url,
      method: this.method,
      headers: {
        'origin': 'https://www.facebook.com',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.106 Safari/537.36',
        'cookie': this.cookie
      },
      formData: payload || undefined,
      qs: this.qs || undefined
    }, (error, response, body) => cb(error, body))
  }

  _getFbDtsg (gid, cb) {
    this.url = `https://www.facebook.com/groups/${gid}`
    this.method = 'GET'
    this._r((error, body) => {
      if (error) return cb(error)

      const $ = load(body)
      const value = $('input[name="fb_dtsg"]').val()

      if (!value) return cb('invalid fb_dtsg value')
      cb(null, value)
    })
  }

  _getMeta (url, cb) {
    let client = new MetaInpector(url)

    client.on('fetch', () => cb(null, {
      title: client.title,
      summary: client.description,
      image: client.image,
      url: client.url
    }))

    client.on('error', e => cb(e))
    client.fetch()
  }

  _composerUrl (payload, cb) {
    const { url, fbDtsg, gid } = payload
    this.url = 'https://www.facebook.com/react_composer/scraper/'
    this.qs = { composer_id: 'rc.js_0', target_id: gid, scrape_url: url, entry_point: 'group' }
    this._r({ '__a': 1, 'fb_dtsg': fbDtsg }, cb)
  }

  post (payload, cb) {
    let { gid, message, url } = payload
    gid = gid || this.gid

    this._getFbDtsg(gid, (e, value) => {
      if (e) return cb(e)

      this.url = 'https://www.facebook.com/ajax/updatestatus.php'
      this.method = 'POST'

      const payload = {
        'xhpc_message': message,
        'xhpc_composerid': 'rc.js_11',
        'xhpc_targetid': gid,
        '__a': 1,
        'fb_dtsg': value
      }

      if (url) {
        this._getMeta(url, (e, r) => {
          if (e) return cb(e)

          const attachment = {
            'attachment[params][title]': r.title,
            'attachment[params][summary]': r.summary,
            'attachment[params][images][0]': r.image,
            'attachment[params][url]': r.url,
            'attachment[type]': 100
          }

          this._composerUrl({ url: r.url, fbDtsg: value, gid: gid }, (e, r) => {
            if (e) return cb(e)

            this.url = 'https://www.facebook.com/ajax/updatestatus.php'
            this.qs = undefined
            this._r(Object.assign(payload, attachment), cb)
          })
        })
      } else {
        this._r(payload, (e, r) => cb(e, r))
      }
    })
  }
}
