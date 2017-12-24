const urllib = require('url')
const fslib = require('fs')
const pathlib = require('path')

function Create() {

}

function ReplyToURIRequest(urlPath, response) {
	var reply = {
		'statusCode': 500,
		'replyContents': '',
		'logReply': ''
	}

	var file = pathlib.normalize(process.cwd() + '/' + urlPath)
	fslib.readFile(file, function(error, fileContents) {
		if (error) {
			reply.statusCode = 404
			reply.replyContents = '404\'d'
			reply.logReply = reply.replyContents
		} else {
			reply.statusCode = 200
			reply.replyContents = fileContents
			reply.logReply = '{' + file + '}'
		}
		WriteResponse(reply, response)
	})
}

function Update() {

}

function Delete() {

}

function Controller(host, url, response) {
	var parsedURL = urllib.parse(url, true)
	var urlPath = parsedURL.pathname
	var urlQuery = parsedURL.query

	if (!(urlPath.endsWith('.css') || urlPath.endsWith('.png'))) {
		// FIX ME - wow.eo responds with different path than inventory.wow.eo
		var hostSplit = host.split('.', 2)
		urlPath = hostSplit[1] + '/' + hostSplit[0] + urlPath
	}

	if (urlPath.endsWith('/create')) {
		Create()
	} else if (urlPath.endsWith('/edit')) {
		Update()
	} else if (urlPath.endsWith('/delete')) {
		Delete()
	} else {
		ReplyToURIRequest(urlPath, response)
	}
}

function WriteResponse(reply, response) {
	response.writeHead(reply.statusCode)
	response.write(reply.replyContents)
	console.log('Replied with: ' + reply.logReply)
	response.end()
}

exports.Controller = Controller
