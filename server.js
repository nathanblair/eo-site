const port = 8080
const http = require('http')
const urllib = require('url')
const querylib = require('querystring')
const fslib = require('fs')
const pathlib = require('path')
var dblib = require('./database')

// Get run-level of program; execute server on port 80 if root permissions are granted;
// Otherwise, execute server on port 8080

function GetDBPath(host) {
	var dbPath = pathlib.normalize(pathlib.dirname(require.main.filename)) + MapHostToPath(host)
	var dbFile = fslib.readdirSync(dbPath).filter(function(file) {
		return pathlib.extname(file) === '.db'
	})
	return dbPath + dbFile
}

function Create(db, table, response) {
	var sql = 'INSERT INTO ' + table + ' DEFAULT VALUES;'

	db.run(sql, function(error) {
		if (error) { db.close(); ReturnJSON(error, response) }
		else { GetRecords(db, table, response, ' WHERE ID=$id', {$id:this.lastID}) }
	})
}

function Update(db, table, recordToUpdate, response) {
	var updateRecord = JSON.parse(recordToUpdate)
	var updateClause = ''
	for (var eachField in updateRecord.fields) { updateClause += eachField + '=$' + eachField + ',' }
	updateClause = updateClause.replace(/,$/, '')
	
	var idParamList = ''
	updateRecord.id.forEach(() => idParamList += '?,')
	idParamList = idParamList.replace(/,$/, '')
	
	var whereClause = ' WHERE ' + table + '.ID IN (' + idParamList + ')'
	var sql = 'UPDATE ' + table + ' SET ' + updateClause + whereClause 
	var params = Object.values(updateRecord.fields)
	params = params.concat(updateRecord.id)
	var returnFields = Object.keys(updateRecord.fields).toString()
	if (updateRecord.foreignKey && updateRecord.foreignKey.foreignField) returnFields + ',' + Object.keys(updateRecord.fields).toString() + ',' + updateRecord.foreignKey.table + ',' + updateRecord.foreignKey.field
	if (updateRecord.foreignKey && updateRecord.foreignKey.indirectField) returnFields + ',' + updateRecord.foreignKey.indirectField
	returnFields = ['ID'].concat([returnFields])

	var getID = updateRecord.id

	db.run(sql, params, function(error) {
		if (error) { db.close(); error['id'] = updateRecord.id; ReturnJSON(error, response) }
		else { GetRecords(db, table, response, whereClause, getID, returnFields) }
	})
}

function Delete(db, table, idArray, response) {
	var idParamList = ''
	idArray = JSON.parse(idArray)
	for (var eachID = 0; eachID < idArray.length; eachID++) {idParamList += '?,'}
	idParamList = idParamList.replace(/,$/, '')

	var sql = 'DELETE FROM ' + table + ' WHERE ID IN (' + idParamList + ');'

	db.run(sql, idArray, function(error) {
		if (error) { db.close(); ReturnJSON(error, response) }
		else { GetRecords(db, table, response, ' WHERE ID IN (' + idParamList + ')', idArray, ['ID']) }
	})
}

function GetFields(db, table, response) {
	var sql = 'SELECT sql FROM sqlite_master WHERE type="table" AND tbl_name="' + table + '"'
	
	db.all(sql, function(error, rows) {
		db.close(); if (error) { ReturnJSON(error, response) }
		else {
			var fields = {}
			rows[0].sql.match(/`\w+`\s+(INTEGER|TEXT|NUMBER|BLOB|REAL).*(\,|\n)/g).forEach(declaration => {
				var fieldName = declaration.match(/`(\w+)`/)[1]
				var typeSet = declaration.match(/`\w+`\s*(\w+)/)[1]
				var readOnlyFlag = declaration.match(/FOREIGN KEY/) || fieldName.includes('ID')
				var foreignKeyTable = declaration.match(/FOREIGN KEY/)
				var rangeMatch = declaration.match(/CHECK\(\w+ IN \((.+)\)\)/)
				var foreignKey = {}
				var foreignKeyExp = RegExp("FOREIGN KEY\\(`" + fieldName + "`\\) REFERENCES `\\w+`\\(`\\w+`\\)",'g')
				var foreignKeys = rows[0].sql.match(foreignKeyExp)
				if (foreignKeys) {
					foreignKey.table = foreignKeys[0].match(/REFERENCES `(\w+)`/)[1]
					foreignKey.field = foreignKeys[0].match(/REFERENCES `\w+`\(`(\w+)`\)/)[1]
					if (foreignKey.field === 'ID') foreignKey.indirectField = 'Name'
				}

				rangeMatch = (rangeMatch) ? rangeMatch[1].replace(/'| /g, '').split(',') : null
				fields[fieldName] = {type:typeSet, readOnly:readOnlyFlag, range:rangeMatch, foreignKey:foreignKey}
			})
			ReturnJSON(fields, response)
		}
	})
}

function GetRecords(db, table, response, filterClause = '', params = [], fields = '*') {
	var selectFields = ''
	var innerJoins = []
	if (fields !== '*') {
		fields.forEach(eachField => {
			let [localField, foreignTable, foreignField, indirectField] = eachField.split(',')
			if (foreignField && foreignTable) {
				if (indirectField) selectFields += foreignTable + '.' + indirectField + ','
				innerJoins.push(' INNER JOIN ' + foreignTable + ' ON ' + localField + ' = ' + foreignTable + '.' + foreignField)
			}
			selectFields += table + '.' + localField + ','
		})
		selectFields = selectFields.replace(/,$/,'')
	}
	else { selectFields = fields }
	if (typeof filterClause == 'object') {
		if (!Object.keys(filterClause).length) filterClause = ''
		else {
			var tempClause = " WHERE "
			for (let [key, value] of Object.entries(filterClause)) {
				let op = value[0] === '!' ? ' NOT IN (' : ' IN ('
				let paramValues = value.replace(/^[!\|<>]/,'').split(',')
				tempClause += table + '.' + key + op
				paramValues.forEach(param => { if (param !== "") { tempClause += '?,'; params.push(param) } })
				tempClause = tempClause.replace(/,$/, '')
				tempClause += ') AND '
			}
			filterClause = tempClause.replace(/( AND )$/, '')
		}
	}
	var sql = 'SELECT ' + selectFields + ' FROM ' + table + innerJoins.toString().replace(/,/g, '') + filterClause + ';'

	db.all(sql, params, function(error, rows) {
		db.close()
		if (error) { ReturnJSON(error, response) } else { ReturnJSON(rows, response) }
	})
}

function GetMain(host, urlPath, response) { HandleResourceRequest(MapHostToPath(host) + urlPath + '.html', response) }

function MapHostToPath(host) { return '/' + host.domain + '/' + host.subdomain + '/' }

function ParseHost(host) {
	var hostSplit = host.split('.')

	var port = hostSplit[hostSplit.length - 1].split(':')[1] || ''
	var tld = hostSplit[hostSplit.length - 1].split(':')[0] || ''
	var domain = hostSplit[hostSplit.length - 2] || ''
	var subdomain = hostSplit[hostSplit.length - 3] || ''

	return {'port': port, 'tld': tld, 'domain': domain, 'subdomain': subdomain}
}

function GetContentTypeFromFile(file) {
	switch (file.substr(file.lastIndexOf('.'))) {
		case '.html':
			return 'text/html'
		case '.css':
			return 'text/css'
		case '.js':
			return 'application/javascript'
		case '.png':
			return 'image/png'
		case '.jpeg':
			return 'image/jpeg'
		case '.svg':
			return 'image/svg+xml'
		default:
			return 'text/plain'
	}
}

function ReturnJSON(json, response) {
	var jsonString = JSON.stringify(json).replace(/(^["'])+|(["']$)+/g, '')

	response.setHeader('Content-Type', 'application/json')
	response.statusCode = 200

	response.write(jsonString)
	response.end()
}

function HandleResourceRequest(urlPath, response) {
	var file = pathlib.normalize(pathlib.dirname(require.main.filename) + '/' + urlPath)
	fslib.readFile(file, function(error, fileContents) {
		var statusCode = 500
		var contentType = GetContentTypeFromFile(file)
		if (!error) {
			statusCode = 200
		} else {
			fileContents = 'Could not find file ' + file
			statusCode =  404
		}
		response.statusCode = statusCode
		response.setHeader('Content-Type', contentType)	
		response.write(fileContents)
		response.end()
	})
}

function HandleDatabaseRequest(host, urlPath, response, action = 'getRecords', urlQuery = [], records = []) {
	var dbPath = GetDBPath(host)
	dblib.Database(dbPath)
	var table = urlQuery.table
	delete urlQuery.table
	var fields = Array.isArray(urlQuery.fields) ? urlQuery.fields : [urlQuery.fields]
	delete urlQuery.fields

	if (action === 'create') { Create(dblib.db, table, response) } 
	else if (action === 'update') { Update(dblib.db, table, records, response) }
	else if (action === 'delete') { Delete(dblib.db, table, records, response) }
	else if (action === 'getFields') { GetFields(dblib.db, table, response) }
	else if (action === 'getRecords') { GetRecords(dblib.db, table, response, urlQuery, [], fields) }
}

function Router(request, response) {
	var host = ParseHost(request.headers.host)
	var parsedURL = urllib.parse(request.url)
	var urlPath = parsedURL.pathname
	var urlQuery = querylib.parse(parsedURL.query)
	var requestData = ''
	if (urlPath.endsWith('/')) urlPath = '/' + host.domain + '/index.html'
	var action = urlPath.substr(urlPath.lastIndexOf('/') + 1)

	if (request.method === 'POST') {
		request.on('data', (data) => requestData += data.toString() )
		request.on('end', () => HandleDatabaseRequest(host, urlPath, response, action, urlQuery, requestData))
		return
	} 
	
	if (action.includes('.')) { HandleResourceRequest(urlPath, response) }
	else if (action === 'main') { GetMain(host, urlPath, response) }
	else { HandleDatabaseRequest(host, urlPath, response, action, urlQuery) }
}

var server = http.createServer(Router).listen(port)
