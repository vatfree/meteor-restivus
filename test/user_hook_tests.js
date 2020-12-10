import { Meteor } from 'meteor/meteor';
import { Restivus } from '../lib/restivus';

const HookApi = new Restivus({
    useDefaultAuth: true,
    apiPath: 'hook-api',
    onLoggedIn: function () {
        return Meteor.users.findOne({
            _id: this.userId
        });
    },
    onLoggedOut: function () {
        return Meteor.users.findOne({
            _id: this.userId
        });
    }
});

const DefaultApi = new Restivus({
    useDefaultAuth: true,
    apiPath: 'no-hook-api'
});

describe('User login and logout', function () {
    let token = null;
    let username = 'test2';
    let email = 'test2@ivus.com';
    let password = 'password';
    Meteor.users.remove({
        username: username
    });
    let userId = Accounts.createUser({
        username: username,
        email: email,
        password: password
    });

    describe('with hook returns', function () {
        it('should call the onLoggedIn hook and attach returned data to the response as data.extra', function (test, waitFor) {
            HTTP.post(Meteor.absoluteUrl('hook-api/login'), {
                data: {
                    username: username,
                    password: password
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
                test.equal(response.data.userId, userId);
                test.equal(response.data.extra.username, username);
                token = response.data.authToken;
            }));
        });

        it('should call the onLoggedOut hook and attach returned data to the response as data.extra', function (test, waitFor) {
            HTTP.post(Meteor.absoluteUrl('hook-api/logout'), {
                headers: {
                    'X-User-Id': userId,
                    'X-Auth-Token': token
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
                test.equal(response.data.extra.username, username);
            }));
        });
    });

    describe('without hook returns', function () {
        it('should not attach data.extra to the response when login is called', function (test, waitFor) {
            HTTP.post(Meteor.absoluteUrl('no-hook-api/login'), {
                data: {
                    username: username,
                    password: password
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
                test.equal(response.data.userId, userId);
                test.isUndefined(response.data.extra);
                token = response.data.authToken;
            }));
        });

        it('should not attach data.extra to the response when logout is called', function (test, waitFor) {
            HTTP.post(Meteor.absoluteUrl('no-hook-api/logout'), {
                headers: {
                    'X-User-Id': userId,
                    'X-Auth-Token': token
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
                test.isUndefined(response.data.extra);
            }));
        });
    });
});
