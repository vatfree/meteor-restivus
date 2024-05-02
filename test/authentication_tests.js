import { Meteor } from 'meteor/meteor';
import { Restivus } from '../lib/restivus';

const DefaultAuthApi = new Restivus({
    apiPath: 'default-auth',
    useDefaultAuth: true
});

const NoDefaultAuthApi = new Restivus({
    apiPath: 'no-default-auth',
    useDefaultAuth: false
});

const LegacyDefaultAuthApi = new Restivus({
    apiPath: 'legacy-default-auth',
    useAuth: true
});

const LegacyNoDefaultAuthApi = new Restivus({
    apiPath: 'legacy-no-default-auth',
    useAuth: false
});

describe('Authentication', function () {
    it('can be required even when the default endpoints aren\'t configured', function (test, waitFor) {
        NoDefaultAuthApi.addRoute('require-auth', {
            authRequired: true
        }, {
            get: function () {
                return {
                    data: 'test'
                };
            }
        });
        const startTime = new Date();
        return HTTP.get(Meteor.absoluteUrl('no-default-auth/require-auth'), waitFor(function (error, result) {
            var durationInMilliseconds, response;
            response = result.data;
            test.isTrue(error);
            test.equal(result.statusCode, 401);
            test.equal(response.status, 'error');
            durationInMilliseconds = new Date() - startTime;
            test.isTrue(durationInMilliseconds >= 500);
        }));
    });
    describe('The default authentication endpoints', function () {
        let token = null;
        let emailLoginToken = null;
        let username = 'test';
        let email = 'test@ivus.com';
        let password = 'password';

        Meteor.users.remove({
            username: username
        });

        let userId = Accounts.createUser({
            username: username,
            email: email,
            password: password
        });

        it('should only be available when configured', function (test, waitFor) {
            HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
                data: {
                    user: username,
                    password: password
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
                test.equal(response.data.userId, userId);
                test.isTrue(response.data.authToken);
            }));

            HTTP.post(Meteor.absoluteUrl('no-default-auth/login'), {
                data: {
                    user: username,
                    password: password
                }
            }, waitFor(function (error, result) {
                let response, _ref, _ref1;
                response = result.data;
                test.isUndefined(response != null ? (_ref = response.data) != null ? _ref.userId : void 0 : void 0);
                test.isUndefined(response != null ? (_ref1 = response.data) != null ? _ref1.authToken : void 0 : void 0);
            }));

            HTTP.post(Meteor.absoluteUrl('legacy-default-auth/login'), {
                data: {
                    user: username,
                    password: password
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
                test.equal(response.data.userId, userId);
                test.isTrue(response.data.authToken);
            }));

            HTTP.post(Meteor.absoluteUrl('legacy-no-default-auth/login'), {
                data: {
                    user: username,
                    password: password
                }
            }, waitFor(function (error, result) {
                let response, _ref, _ref1;
                response = result.data;
                test.isUndefined(response != null ? (_ref = response.data) != null ? _ref.userId : void 0 : void 0);
                test.isUndefined(response != null ? (_ref1 = response.data) != null ? _ref1.authToken : void 0 : void 0);
            }));
        });

        it('should allow a user to login', function (test, waitFor) {
            HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
                data: {
                    username: username,
                    password: password
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
                test.equal(response.data.userId, userId);
                test.isTrue(response.data.authToken);
            }));
            HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
                data: {
                    email: email,
                    password: password
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
                test.equal(response.data.userId, userId);
                test.isTrue(response.data.authToken);
            }));
            HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
                data: {
                    user: username,
                    password: password
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
                test.equal(response.data.userId, userId);
                test.isTrue(response.data.authToken);
            }));
            return HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
                data: {
                    user: email,
                    password: password
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
                test.equal(response.data.userId, userId);
                test.isTrue(response.data.authToken);
                token = response.data.authToken;
            }));
        });

        it('should allow a user to login again, without affecting the first login', function (test, waitFor) {
            HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
                data: {
                    user: email,
                    password: password
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
                test.equal(response.data.userId, userId);
                test.isTrue(response.data.authToken);
                test.notEqual(token, response.data.authToken);
                emailLoginToken = response.data.authToken;
            }));
        });

        it('should not allow a user with wrong password to login and should respond after 500 msec', function (test, waitFor) {
            const startTime = new Date();
            HTTP.post(Meteor.absoluteUrl('default-auth/login'), {
                data: {
                    user: username,
                    password: 'NotAllowed'
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 401);
                test.equal(response.status, 'error');
                const durationInMilliseconds = new Date() - startTime;
                test.isTrue(durationInMilliseconds >= 500);
            }));
        });

        it('should allow a user to logout', function (test, waitFor) {
            HTTP.post(Meteor.absoluteUrl('default-auth/logout'), {
                headers: {
                    'X-User-Id': userId,
                    'X-Auth-Token': token
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                test.equal(response.status, 'success');
            }));
        });

        it('should remove the logout token after logging out and should respond after 500 msec', function (test, waitFor) {
            DefaultAuthApi.addRoute('prevent-access-after-logout', {
                authRequired: true
            }, {
                get: function () {
                    return true;
                }
            });
            const startTime = new Date();
            HTTP.get(Meteor.absoluteUrl('default-auth/prevent-access-after-logout'), {
                headers: {
                    'X-User-Id': userId,
                    'X-Auth-Token': token
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.isTrue(error);
                test.equal(result.statusCode, 401);
                test.equal(response.status, 'error');
                const durationInMilliseconds = new Date() - startTime;
                test.isTrue(durationInMilliseconds >= 500);
            }));
        });

        it('should allow a second logged in user to logout', function (test, waitFor) {
            HTTP.post(Meteor.absoluteUrl('default-auth/logout'), {
                headers: {
                    'X-User-Id': userId,
                    'X-Auth-Token': emailLoginToken
                }
            }, waitFor(function (error, result) {
                const response = result.data;
                test.equal(result.statusCode, 200);
                return test.equal(response.status, 'success');
            }));
        });
    });

    describe('An API with custom auth (with a custom error response)', function () {
        const CustomErrorAuthApi = new Restivus({
            apiPath: 'custom-error-auth',
            useDefaultAuth: true,
            auth: {
                token: 'services.resume.loginTokens.hashedToken',
                user: function () {
                    const userId = this.request.headers['x-user-id'];
                    const token = this.request.headers['x-auth-token'];
                    if (userId && token) {
                        return {
                            userId: userId,
                            token: Accounts._hashLoginToken(token)
                        };
                    } else {
                        return {
                            error: {
                                statusCode: 499,
                                body: 'Error!'
                            },
                            userId: true,
                            token: true
                        };
                    }
                }
            }
        });

        CustomErrorAuthApi.addRoute('test', {
            authRequired: true
        }, {
            get: function () {
                return true;
            }
        });

        it('should return a custom error response when provided', function (test, waitFor) {
            HTTP.get(Meteor.absoluteUrl('custom-error-auth/test'), {}, waitFor(function (error, result) {
                test.isTrue(error);
                test.equal(result.statusCode, 499);
                test.equal(result.data, 'Error!');
            }));
        });
    });
});
