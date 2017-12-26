const port = 8080
const http = require('http')

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

	// Map subdomains to respective directories (subdomains are not routed to different IP's)
	if (!(urlPath.endsWith('.css') || urlPath.endsWith('.png'))) {
		var hostSplit = host.split('.')
		var maxIndex = hostSplit.length - 1

		if (maxIndex >= 2) {
			urlPath = '/' + hostSplit[maxIndex - 2] + urlPath
		}

		urlPath = '/' + hostSplit[maxIndex - 1] + urlPath
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

function Router(request, response) {
	var host = request.headers.host
	var url = request.url
	if (url.endsWith('/')) {
		url += 'index.html'
	}

	console.log('Request at {' + host + '} for {' + url + '} from {' + request.connection.remoteAddress + '}')
	Controller(host, url, response)
}

var server = http.createServer(Router)

server.listen(port)

console.log('Server listening on port: ' + port)
