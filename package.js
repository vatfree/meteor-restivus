Package.describe({
  name: 'nimble:restivus',
  summary: 'Create authenticated REST APIs in Meteor 0.9+ via HTTP/HTTPS. Setup CRUD endpoints for Collections.',
  version: '0.8.12',
  git: 'https://github.com/kahmali/meteor-restivus.git',
});

Package.onUse(function(api) {
  // Minimum Meteor version
  api.versionsFrom('METEOR@1.6.1');

  // Meteor dependencies
  api.use('check');
  api.use('coffeescript');
  api.use('underscore');
  api.use('accounts-password@1.3.3');
  api.use('simple:json-routes@2.1.0');

  api.addFiles('lib/iron-router-error-to-response.js', 'server');
  api.addFiles('lib/route.js', 'server');
  api.addFiles('lib/restivus.js', 'server');

  // Exports
  api.export('Restivus', 'server');
});

Package.onTest(function(api) {
  // Meteor dependencies
  api.use('practicalmeteor:munit');
  api.use('test-helpers');
  api.use('nimble:restivus');
  api.use('http');
  api.use('coffeescript');
  api.use('underscore');
  api.use('accounts-base');
  api.use('accounts-password');
  api.use('mongo');

  api.addFiles('lib/route.js', 'server');
});
