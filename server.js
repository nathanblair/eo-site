const port = 8080
const http = require('http')
const url = require('url')
const fs = require('fs')

function ServerAction(request, response) {
	var uri = process.cwd() + request.url
	url_parts = url.parse(request.url, true)

	if (uri.endsWith('/create')) {
		// CREATE TODO
	} else if (uri.endsWith('/edit')) {
		// EDIT TODO
	} else if (uri.endsWith('/delete')) {
		// DELETE TODO
	} else {
		if (uri.endsWith('/')) {
			uri += 'index.html'
		}
		console.log('Request for: ' + uri + ' from ' + request.connection.remoteAddress)
		fs.readFile(uri, function(error, fileContents) {
			if (error) {
				console.log('Replied: 404\'d')
				response.writeHead(404)
				response.write(resp)
			} else {
				response.writeHead(200)
				response.write(fileContents)
				console.log('Replied with ' + uri)
			}
			response.end()
		})
	}
}

http.createServer(ServerAction).listen(port)

console.log('Server listening on port: ' + port)
