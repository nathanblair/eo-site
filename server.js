const port = 8080
const http = require('http')
const wow = require('./wow/wow')

function Router(request, response) {
	var host = request.headers.host
	var url = request.url
	if (url.endsWith('/')) {
		url += 'index.html'
	}

	console.log('Request at {' + host + '} for {' + url + '} from {' + request.connection.remoteAddress + '}')
	if (host.includes('wow')) {
		wow.Controller(host, url, response)
	}
}

var server = http.createServer(Router)

server.listen(port)

console.log('Server listening on port: ' + port)
