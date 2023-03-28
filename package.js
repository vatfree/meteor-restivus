Package.describe({
  name: 'vatfree:restivus',
  summary: 'Create authenticated REST APIs in Meteor via HTTP/HTTPS. Setup CRUD endpoints for Collections.',
  version: '1.1.1',
  git: 'https://github.com/vatfree/meteor-restivus.git'
});

Package.onUse(function (api) {
  api.versionsFrom(['1.10', '2.0']);

  // Meteor dependencies
  api.use('ecmascript');
  api.use('check');
  api.use('underscore');
  api.use('accounts-password@~2.0.0');
  api.use('simple:json-routes@2.1.0');
  api.use('alanning:roles@1.3.0', 'server', {weak: true});

  api.addFiles([
    'lib/auth.js',
    'lib/route.js',
    'lib/restivus.js'
  ], 'server');
  api.mainModule('index.js', 'server');
  api.export(['Restivus']);
});
