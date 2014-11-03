run = (app, options, cb) ->
  listenCallback = (err) ->
    console.log "%d listening. Go to: http://localhost:%d/", process.pid, port
    cb and cb(err)
    return
  createServer = ->
    app = require(app)  if typeof app is "string"
    require(__dirname + "/src/server").setup app, options, (err, expressApp, upgrade) ->
      throw err  if err
      server = require("http").createServer(expressApp)
      server.on "upgrade", upgrade
      server.listen port, listenCallback
      return

    return
  options or (options = {})
  port = options.port or process.env.PORT or 3000
  derby.run createServer
  return
derby = require("derby")
exports.run = run
run __dirname + "/src"