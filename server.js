const 	port = 8080
		http = require('http')
		url = require('url')
		fs = require('fs')

function ServerAction(request, response) {
	var uri = process.cwd() + request.url
	url_parts = url.parse(request.url, true)
	console.log('Request for: ' + uri + ' from ' + request.connection.remoteAddress)

	if (uri.endsWith('/create')) {
		// CREATE TODO
	} else if (uri.endsWith('/edit')) {
		// EDIT TODO
	} else if (uri.endsWith('/delete')) {
		// DELETE TODO
	} else {
		if (!(uri.endsWith('index.html'))) {
			uri += 'index.html'
		}
		fs.readFile(uri, function(error, fileContents) {
			if (error) {
				var resp = '404\'d!'
				console.log('Replied: ' + resp)
				response.writeHead(404)
				response.write(resp)
			} else {
				response.writeHead(200, {'Content-Type': 'text/html'})
				response.write(fileContents)
				console.log('Replied with ' + uri)
			}
			response.end()
		})
	}
}

http.createServer(ServerAction).listen(port)

console.log('Server listening on port: ' + port)
