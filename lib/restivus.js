import { _ } from 'underscore';
import { Accounts } from 'meteor/accounts-base';
import { Route } from './route';
import { Auth } from './auth';

export const Restivus = function (options) {
    let corsHeaders;
    this._routes = [];
    this._config = {
        paths: [],
        useDefaultAuth: false,
        apiPath: 'api/',
        version: null,
        prettyJson: false,
        auth: {
            token: 'services.resume.loginTokens.hashedToken',
            user: function () {
                var token;
                if (this.request.headers['x-auth-token']) {
                    token = Accounts._hashLoginToken(this.request.headers['x-auth-token']);
                }
                return {
                    userId: this.request.headers['x-user-id'],
                    token: token
                };
            }
        },
        defaultHeaders: {
            'Content-Type': 'application/json'
        },
        enableCors: true
    };
    _.extend(this._config, options);

    if (this._config.enableCors) {
        corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
        };

        if (this._config.useDefaultAuth) {
            corsHeaders['Access-Control-Allow-Headers'] += ', X-User-Id, X-Auth-Token';
        }
        _.extend(this._config.defaultHeaders, corsHeaders);

        if (!this._config.defaultOptionsEndpoint) {
            this._config.defaultOptionsEndpoint = function () {
                this.response.writeHead(200, corsHeaders);
                return this.done();
            };
        }
    }

    if (this._config.apiPath[0] === '/') {
        this._config.apiPath = this._config.apiPath.slice(1);
    }

    if (_.last(this._config.apiPath) !== '/') {
        this._config.apiPath = this._config.apiPath + '/';
    }

    if (this._config.version) {
        this._config.apiPath += this._config.version + '/';
    }

    if (this._config.useDefaultAuth) {
        this._initAuth();
    } else if (this._config.useAuth) {
        this._initAuth();
        console.warn('Warning: useAuth API config option will be removed in Restivus v1.0 ' + '\n    Use the useDefaultAuth option instead');
    }

    return this;
};

/**
 Add endpoints for the given HTTP methods at the given path

 @param path {String} The extended URL path (will be appended to base path of the API)
 @param options {Object} Route configuration options
 @param options.authRequired {Boolean} The default auth requirement for each endpoint on the route
 @param options.roleRequired {String or String[]} The default role required for each endpoint on the route
 @param endpoints {Object} A set of endpoints available on the new route (get, post, put, patch, delete, options)
 @param endpoints.<method> {Function or Object} If a function is provided, all default route
 configuration options will be applied to the endpoint. Otherwise an object with an `action`
 and all other route config options available. An `action` must be provided with the object.
 */
Restivus.prototype.addRoute = function (path, options, endpoints) {
    const route = new Route(this, path, options, endpoints);
    this._routes.push(route);
    route.addToApi();

    return this;
};

/**
 Generate routes for the Meteor Collection with the given name
 */
Restivus.prototype.addCollection = function (collection, options) {
    if (options == null) {
        options = {};
    }

    const methods = ['get', 'post', 'put', 'patch', 'delete', 'getAll'];
    const methodsOnCollection = ['post', 'getAll'];

    let collectionEndpoints,
        collectionRouteEndpoints,
        endpointsAwaitingConfiguration,
        entityRouteEndpoints,
        excludedEndpoints;

    if (collection === Meteor.users) {
        collectionEndpoints = this._userCollectionEndpoints;
    } else {
        collectionEndpoints = this._collectionEndpoints;
    }
    endpointsAwaitingConfiguration = options.endpoints || {};

    const routeOptions = options.routeOptions || {};
    excludedEndpoints = options.excludedEndpoints || [];

    const path = options.path || collection._name;
    collectionRouteEndpoints = {};
    entityRouteEndpoints = {};

    if (_.isEmpty(endpointsAwaitingConfiguration) && _.isEmpty(excludedEndpoints)) {
        _.each(methods, function (method) {
            if (methodsOnCollection.indexOf(method) >= 0) {
                _.extend(collectionRouteEndpoints, collectionEndpoints[method].call(this, collection));
            } else {
                _.extend(entityRouteEndpoints, collectionEndpoints[method].call(this, collection));
            }
        }, this);
    } else {
        _.each(methods, function (method) {
            if (excludedEndpoints.indexOf(method) < 0 && endpointsAwaitingConfiguration[method] !== false) {
                const endpointOptions = endpointsAwaitingConfiguration[method];
                const configuredEndpoint = {};
                _.each(collectionEndpoints[method].call(this, collection), function (action, methodType) {
                    return configuredEndpoint[methodType] = _.chain(action).clone().extend(endpointOptions).value();
                });
                if (methodsOnCollection.indexOf(method) >= 0) {
                    _.extend(collectionRouteEndpoints, configuredEndpoint);
                } else {
                    _.extend(entityRouteEndpoints, configuredEndpoint);
                }
            }
        }, this);
    }

    this.addRoute(path, routeOptions, collectionRouteEndpoints);
    this.addRoute(path + '/:id', routeOptions, entityRouteEndpoints);

    return this;
};

/**
 * Creates a MongoDB selector query from the request queries.
 * @param queryParams queryParams object from the request object
 * @returns selector object for the MongoDB
 */
const getQueryParameters = function (queryParams) {
    const selector = {};
    Object.keys(queryParams).forEach(function (key, index) {
        if (isNaN(Number(queryParams[key]))) {
            selector[key] = queryParams[key];
        } else {
            selector[key] = Number(queryParams[key]);
        }
    });

    return selector;
};

/**
 A set of endpoints that can be applied to a Collection Route
 */
Restivus.prototype._collectionEndpoints = {
    get: function (collection) {
        return {
            get: {
                action: function () {
                    const selector = getQueryParameters(this.queryParams);
                    selector._id = this.urlParams.id;

                    const entity = collection.find(selector).fetch();
                    if (!_.isEmpty(entity)) {
                        return {
                            status: 'success',
                            data: entity
                        };
                    } else {
                        return {
                            statusCode: 204,
                            body: {
                                status: 'fail',
                                message: 'Item not found'
                            }
                        };
                    }
                }
            }
        };
    },
    put: function (collection) {
        return {
            put: {
                action: function () {
                    const selector = getQueryParameters(this.queryParams);
                    selector._id = this.urlParams.id;

                    const entityIsUpdated = collection.update(selector, this.bodyParams);
                    if (entityIsUpdated) {
                        const entity = collection.findOne(this.urlParams.id);
                        return {
                            status: 'success',
                            data: entity
                        };
                    } else {
                        return {
                            statusCode: 400,
                            body: {
                                status: 'fail',
                                message: 'Item not updated'
                            }
                        };
                    }
                }
            }
        };
    },
    patch: function (collection) {
        return {
            patch: {
                action: function () {
                    const selector = getQueryParameters(this.queryParams);
                    selector._id = this.urlParams.id;

                    const entityIsUpdated = collection.update(selector, {
                        $set: this.bodyParams
                    });
                    if (entityIsUpdated) {
                        const entity = collection.findOne(selector);
                        return {
                            status: 'success',
                            data: entity
                        };
                    } else {
                        return {
                            statusCode: 400,
                            body: {
                                status: 'fail',
                                message: 'Item not updated'
                            }
                        };
                    }
                }
            }
        };
    },
    'delete': function (collection) {
        return {
            'delete': {
                action: function () {
                    const selector = getQueryParameters(this.queryParams);
                    selector._id = this.urlParams.id;

                    if (collection.remove(selector)) {
                        return {
                            status: 'success',
                            data: {
                                message: 'Item removed'
                            }
                        };
                    } else {
                        return {
                            statusCode: 400,
                            body: {
                                status: 'fail',
                                message: 'Could not delete item'
                            }
                        };
                    }
                }
            }
        };
    },
    post: function (collection) {
        return {
            post: {
                action: function () {
                    const entityId = collection.insert(this.bodyParams);
                    const entity = collection.findOne(entityId);
                    if (!_.isEmpty(entity)) {
                        return {
                            statusCode: 201,
                            body: {
                                status: 'success',
                                data: entity
                            }
                        };
                    } else {
                        return {
                            statusCode: 400,
                            body: {
                                status: 'fail',
                                message: 'No item added'
                            }
                        };
                    }
                }
            }
        };
    },
    getAll: function (collection) {
        return {
            get: {
                action: function () {
                    const selector = getQueryParameters(this.queryParams);
                    const entities = collection.find(selector).fetch();
                    if (entities) {
                        return {
                            status: 'success',
                            data: entities
                        };
                    } else {
                        return {
                            statusCode: 204,
                            body: {
                                status: 'fail',
                                message: 'Unable to retrieve items from collection'
                            }
                        };
                    }
                }
            }
        };
    }
};

/**
 A set of endpoints that can be applied to a Meteor.users Collection Route
 */
Restivus.prototype._userCollectionEndpoints = {
    get: function (collection) {
        return {
            get: {
                action: function () {
                    const entity = collection.findOne(this.urlParams.id, {
                        fields: {
                            profile: 1
                        }
                    });
                    if (entity) {
                        return {
                            status: 'success',
                            data: entity
                        };
                    } else {
                        return {
                            statusCode: 404,
                            body: {
                                status: 'fail',
                                message: 'User not found'
                            }
                        };
                    }
                }
            }
        };
    },
    put: function (collection) {
        return {
            put: {
                action: function () {
                    const entityIsUpdated = collection.update(this.urlParams.id, {
                        $set: {
                            profile: this.bodyParams
                        }
                    });
                    if (entityIsUpdated) {
                        const entity = collection.findOne(this.urlParams.id, {
                            fields: {
                                profile: 1
                            }
                        });
                        return {
                            status: 'success',
                            data: entity
                        };
                    } else {
                        return {
                            statusCode: 404,
                            body: {
                                status: 'fail',
                                message: 'User not found'
                            }
                        };
                    }
                }
            }
        };
    },
    'delete': function (collection) {
        return {
            'delete': {
                action: function () {
                    if (collection.remove(this.urlParams.id)) {
                        return {
                            status: 'success',
                            data: {
                                message: 'User removed'
                            }
                        };
                    } else {
                        return {
                            statusCode: 404,
                            body: {
                                status: 'fail',
                                message: 'User not found'
                            }
                        };
                    }
                }
            }
        };
    },
    post: function (collection) {
        return {
            post: {
                action: function () {
                    const entityId = Accounts.createUser(this.bodyParams);
                    const entity = collection.findOne(entityId, {
                        fields: {
                            profile: 1
                        }
                    });
                    if (entity) {
                        return {
                            statusCode: 201,
                            body: {
                                status: 'success',
                                data: entity
                            }
                        };
                    } else {
                        return ({
                            statusCode: 400,
                            body: {
                                status: 'fail',
                                message: 'No user added'
                            }
                        });
                    }
                }
            }
        };
    },
    getAll: function (collection) {
        return {
            get: {
                action: function () {
                    const entities = collection.find({}, {
                        fields: {
                            profile: 1
                        }
                    }).fetch();
                    if (entities) {
                        return {
                            status: 'success',
                            data: entities
                        };
                    } else {
                        return {
                            statusCode: 404,
                            body: {
                                status: 'fail',
                                message: 'Unable to retrieve users'
                            }
                        };
                    }
                }
            }
        };
    }
};

/*
 Add /login and /logout endpoints to the API
 */
Restivus.prototype._initAuth = function () {
    const self = this;

    /*
     Add a login endpoint to the API

     After the user is logged in, the onLoggedIn hook is called (see Restfully.configure() for
     adding hook).
     */
    this.addRoute('login', {
        authRequired: false
    }, {
        post: function () {
            let auth;

            const user = {};
            if (this.bodyParams.user) {
                if (this.bodyParams.user.indexOf('@') === -1) {
                    user.username = this.bodyParams.user;
                } else {
                    user.email = this.bodyParams.user;
                }
            } else if (this.bodyParams.username) {
                user.username = this.bodyParams.username;
            } else if (this.bodyParams.email) {
                user.email = this.bodyParams.email;
            }

            let password = this.bodyParams.password;
            if (this.bodyParams.hashed) {
                password = {
                    digest: password,
                    algorithm: 'sha-256'
                };
            }

            try {
                auth = Auth.loginWithPassword(user, password);
            } catch (e) {
                return {
                    statusCode: e.error,
                    body: {
                        status: 'error',
                        message: e.reason
                    }
                };
            }

            if (auth.userId && auth.authToken) {
                const searchQuery = {};
                searchQuery[self._config.auth.token] = Accounts._hashLoginToken(auth.authToken);
                this.user = Meteor.users.findOne({
                    '_id': auth.userId
                }, searchQuery);

                this.userId = this.user ? this.user._id : null;
            }

            const response = {
                status: 'success',
                data: auth
            };

            const onLoggedIn = self._config.onLoggedIn;
            const extraData = _.isFunction(onLoggedIn) ? onLoggedIn.call(this) : null;
            if (extraData != null) {
                _.extend(response.data, {
                    extra: extraData
                });
            }

            return response;
        }
    });

    const logout = function () {
        const authToken         = this.request.headers['x-auth-token'];
        const hashedToken       = Accounts._hashLoginToken(authToken);
        const tokenLocation     = self._config.auth.token;
        const index             = tokenLocation.lastIndexOf('.');
        const tokenPath         = tokenLocation.substring(0, index);
        const tokenFieldName    = tokenLocation.substring(index + 1);
        const tokenToRemove     = {};
        tokenToRemove[tokenFieldName] = hashedToken;

        const tokenRemovalQuery = {};
        tokenRemovalQuery[tokenPath] = tokenToRemove;

        Meteor.users.update(this.user._id, {
            $pull: tokenRemovalQuery
        });

        const response = {
            status: 'success',
            data: {
                message: 'You\'ve been logged out!'
            }
        };
        const onLoggedOut = self._config.onLoggedOut;
        const extraData = _.isFunction(onLoggedOut) ? onLoggedOut.call(this) : null;
        if (extraData != null) {
            _.extend(response.data, {
                extra: extraData
            });
        }

        return response;
    };

    /*
     Add a logout endpoint to the API

     After the user is logged out, the onLoggedOut hook is called (see Restfully.configure() for
     adding hook).
     */
    return this.addRoute('logout', {
        authRequired: true
    }, {
        get: function () {
            console.warn('Warning: Default logout via GET will be removed in Restivus v1.0. Use POST instead.');
            console.warn('    See https://github.com/kahmali/meteor-restivus/issues/100');
            return logout.call(this);
        },
        post: logout
    });
};
