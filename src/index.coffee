app = module.exports = require('derby').createApp 'd-passport-example', __filename
app.serverUse module, 'derby-stylus'
app.loadViews __dirname + '/../views'
app.loadStyles __dirname + '/../styles'
app.component require('d-connection-alert')
app.component require('d-before-unload')
app.component(require('d-passport/component'))
app.component(require('derby-flash')(app))

handleUserReg = (page, model, params, next) -> 
  userId = model.get '_session.userId'
  return next() if !userId
  userQ = model.at "auths.#{userId}"
  model.subscribe userQ, (err) ->
    return next err if err
    model.root.ref('_page.user', userQ)
    next()

# must be first
app.get '*', handleUserReg
app.post '*', handleUserReg

app.get '/:room?', (page, model, {room}, next) ->
  page.render(room or 'home')

