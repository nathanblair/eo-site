var activeElement = '#'
if (window.location.pathname !== '/') {
	activeElement += window.location.pathname.replace(/^\/|\/$/g, '')
} else {
	activeElement += window.location.hostname.split('.')[0]
}
$(activeElement).addClass('active')

$.get('main', function( data ) { $('main').html(data) })

