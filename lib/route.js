import { DDPCommon } from 'meteor/ddp-common';
import { DDP } from 'meteor/ddp-client';
import { JsonRoutes } from 'meteor/simple:json-routes';

export const Route = function (api, path, options, endpoints1) {
    this.api = api;
    this.path = path;
    this.options = options;
    this.endpoints = endpoints1;
    if (!this.endpoints) {
        this.endpoints = this.options;
        this.options = {};
    }
};

const availableMethods = ['get', 'post', 'put', 'patch', 'delete', 'options'];
Route.prototype.addToApi = function () {
    const self = this;

    if (_.contains(this.api._config.paths, this.path)) {
        throw new Error('Cannot add a route at an existing path: ' + this.path);
    }

    this.endpoints = _.extend({
        options: this.api._config.defaultOptionsEndpoint
    }, this.endpoints);
    this._resolveEndpoints();
    this._configureEndpoints();

    this.api._config.paths.push(this.path);

    const allowedMethods = _.filter(availableMethods, function (method) {
        return _.contains(_.keys(self.endpoints), method);
    });

    const rejectedMethods = _.reject(availableMethods, function (method) {
        return _.contains(_.keys(self.endpoints), method);
    });

    const fullPath = this.api._config.apiPath + this.path;
    _.each(allowedMethods, function (method) {
        const endpoint = self.endpoints[method];
        return JsonRoutes.add(method, fullPath, function (req, res) {
            let responseInitiated = false;
            let doneFunc = function () {
                return responseInitiated = true;
            };

            const endpointContext = Object.assign({
                urlParams: req.params,
                queryParams: req.query,
                bodyParams: req.body,
                request: req,
                response: res,
                done: doneFunc
            }, endpoint);

            let responseData = null;
            try {
                responseData = self._callEndpoint(endpointContext, endpoint);
            } catch (e) {
                const  env = process.env.NODE_ENV || 'development';
                if (res.statusCode < 400) {
                    res.statusCode = 500;
                }

                if (e.status) {
                    res.statusCode = e.status;
                }

                let msg;
                if (env === 'development') {
                    msg = (e.stack || e.toString()) + '\n';
                } else {
                    msg = 'Server error.';
                }
                console.error(e.stack || e.toString());

                if (res.headersSent) {
                    return req.socket.destroy();
                }

                res.setHeader('Content-Type', 'text/html');
                res.setHeader('Content-Length', Buffer.byteLength(msg));
                if (req.method === 'HEAD') {
                    return res.end();
                }

                res.end(msg);
                return;
            }

            if (responseInitiated) {
                res.end();
                return;
            } else {
                if (res.headersSent) {
                    throw new Error('Must call this.done() after handling endpoint response manually: ' + method + ' ' + fullPath);
                } else if (responseData === null || responseData === void 0) {
                    throw new Error('Cannot return null or undefined from an endpoint: ' + method + ' ' + fullPath);
                }
            }

            if (responseData.body && (responseData.statusCode || responseData.headers)) {
                return self._respond(res, responseData.body, responseData.statusCode, responseData.headers);
            } else {
                return self._respond(res, responseData);
            }
        });
    });

    _.each(rejectedMethods, function (method) {
        JsonRoutes.add(method, fullPath, function (req, res) {
            const responseData = {
                status: 'error',
                message: 'API endpoint does not exist'
            };
            const headers = {
                'Allow': allowedMethods.join(', ').toUpperCase()
            };

            return self._respond(res, responseData, 405, headers);
        });
    });
};

/*
  Convert all endpoints on the given route into our expected endpoint object if it is a bare
  function

  @param {Route} route The route the endpoints belong to
 */
Route.prototype._resolveEndpoints = function () {
    _.each(this.endpoints, function (endpoint, method, endpoints) {
        if (_.isFunction(endpoint)) {
            return endpoints[method] = {
                action: endpoint
            };
        }
    });
};

/*
  Configure the authentication and role requirement on all endpoints (except OPTIONS, which must
  be configured directly on the endpoint)

  Authentication can be required on an entire route or individual endpoints. If required on an
  entire route, that serves as the default. If required in any individual endpoints, that will
  override the default.

  After the endpoint is configured, all authentication and role requirements of an endpoint can be
  accessed at <code>endpoint.authRequired</code> and <code>endpoint.roleRequired</code>,
  respectively.

  @param {Route} route The route the endpoints belong to
  @param {Endpoint} endpoint The endpoint to configure
 */
Route.prototype._configureEndpoints = function () {
    _.each(this.endpoints, (endpoint, method) => {
        if (method !== 'options') {

            if (!_.has(endpoint, 'roleRequired') && _.has(this.options, 'roleRequired')) {
                // set endpoint roleRequired to route roleRequired
                endpoint.roleRequired = this.options.roleRequired;
            }

            if (!_.has(endpoint, 'authRequired')) {
                // check whether global authRequired is on OR roleRequired on the endpoint
                endpoint.authRequired = (
                    (_.has(this.options, 'authRequired') && this.options.authRequired)
                    ||
                    endpoint.roleRequired
                );
            }
        }
    });
};

/*
  Authenticate an endpoint if required, and return the result of calling it

  @returns The endpoint response or a 401 if authentication fails
 */
Route.prototype._callEndpoint = function (endpointContext, endpoint) {
    let auth = this._authAccepted(endpointContext, endpoint);
    const onAuth = this.api._config.onAuth;
    if (_.isFunction(onAuth)) {
        auth = onAuth.call(this, auth) || auth;
    }
    if (auth.success) {
        if (this._roleAccepted(endpointContext, endpoint)) {
            const invocation = new DDPCommon.MethodInvocation({
                isSimulation: false,
                setUserId: function () {
                    throw Error('setUserId not implemented');
                },
                unblock: function () {},
                setHttpStatusCode: function (code) {},
                connection: endpointContext.request,
            });

            const endpointInvocation = Object.assign(invocation, endpointContext);

            const onAction = this.api._config.onAction;
            const onReturn = this.api._config.onReturn;
            return DDP._CurrentInvocation.withValue(invocation, function () {
                endpointInvocation.params = Object.assign({},
                    endpointInvocation.urlParams || {},
                    endpointInvocation.queryParams || {},
                    endpointInvocation.bodyParams || {}
                );

                if (_.isFunction(onAction)) {
                    // global onAction function, this allows to capture all api calls, but also to amend the
                    // context before the action function is called on the route
                    onAction.call(endpointInvocation);
                }

                let returnValue = endpoint.action.call(endpointInvocation);

                if (_.isFunction(onReturn)) {
                    // global onReturn function, this allows to capture the return value and manupulate before
                    // sending to the client
                    returnValue = onReturn.call(endpointInvocation, returnValue) || returnValue;
                }

                return returnValue;
            });
        } else {
            return {
                statusCode: 403,
                body: {
                    status: 'error',
                    message: 'You do not have permission to do this.'
                }
            };
        }
    } else {
        if (auth.data) {
            return auth.data;
        } else {
            return {
                statusCode: 401,
                body: {
                    status: 'error',
                    message: 'You must be logged in to do this.'
                }
            };
        }
    }
};

/*
  Authenticate the given endpoint if required

  Once it's globally configured in the API, authentication can be required on an entire route or
  individual endpoints. If required on an entire endpoint, that serves as the default. If required
  in any individual endpoints, that will override the default.

  @returns An object of the following format:

      {
        success: Boolean
        data: String or Object
      }

    where `success` is `true` if all required authentication checks pass and the optional `data`
    will contain the auth data when successful and an optional error response when auth fails.
 */
Route.prototype._authAccepted = function (endpointContext, endpoint) {
    if (endpoint.authRequired) {
        return this._authenticate(endpointContext);
    } else {
        return {
            success: true
        };
    }
};

/*
  Verify the request is being made by an actively logged in user

  If verified, attach the authenticated user to the context.

  @returns An object of the following format:

      {
        success: Boolean
        data: String or Object
      }

    where `success` is `true` if all required authentication checks pass and the optional `data`
    will contain the auth data when successful and an optional error response when auth fails.
 */
Route.prototype._authenticate = function (endpointContext) {
    const auth = this.api._config.auth.user.call(endpointContext);
    if (!auth) {
        return {
            success: false
        };
    }

    if (auth.userId && auth.token && !auth.user) {
        const userSelector = {};
        userSelector._id = auth.userId;
        userSelector[this.api._config.auth.token] = auth.token;
        auth.user = Meteor.users.findOne(userSelector);
    }

    if (auth.error) {
        return {
            success: false,
            data: auth.error
        };
    }

    if (auth.user) {
        endpointContext.user = auth.user;
        endpointContext.userId = auth.user._id;
        return {
            success: true,
            data: auth
        };
    }

    return {
        success: false
    };
};

/*
  Authenticate the user role if required

  Must be called after _authAccepted().

  @returns True if the authenticated user belongs to <i>any</i> of the acceptable roles on the
           endpoint
 */
Route.prototype._roleAccepted = function (endpointContext, endpoint) {
    if (endpoint.roleRequired) {
        // weak requirement on the roles package, if not installed this will fail
        import { Roles } from 'meteor/alanning:roles';

        let rolesRequired = endpoint.roleRequired;
        if (_.isString(rolesRequired) || _.isArray(rolesRequired)) {
            return Roles.userIsInRole(endpointContext.user._id, rolesRequired);
        } else if (_.isObject(rolesRequired)) {
            check(rolesRequired, {
                roles: Match.OneOf(String, Array),
                scope: Match.Optional(String)
            });
            return Roles.userIsInRole(endpointContext.user._id, rolesRequired.roles, rolesRequired.scope);
        }

        return false;
    }

    return true;
};

/*
  Respond to an HTTP request
 */
Route.prototype._respond = function (response, body, statusCode, headers) {
    if (statusCode == null) {
        statusCode = 200;
    }

    if (headers == null) {
        headers = {};
    }

    const defaultHeaders = this._lowerCaseKeys(this.api._config.defaultHeaders);
    headers = this._lowerCaseKeys(headers);
    headers = _.extend(defaultHeaders, headers);
    if (headers['content-type'].match(/json|javascript/) !== null) {
        if (this.api._config.prettyJson) {
            body = JSON.stringify(body, void 0, 2);
        } else {
            body = JSON.stringify(body);
        }
    }

    const sendResponse = function () {
        response.writeHead(statusCode, headers);
        response.write(body);
        return response.end();
    };

    if (statusCode === 401 || statusCode === 403) {
        const minimumDelayInMilliseconds = 500;
        const randomMultiplierBetweenOneAndTwo = 1 + Math.random();
        const delayInMilliseconds = minimumDelayInMilliseconds * randomMultiplierBetweenOneAndTwo;
        return Meteor.setTimeout(sendResponse, delayInMilliseconds);
    }

    return sendResponse();
};

/*
  Return the object with all of the keys converted to lowercase
 */
Route.prototype._lowerCaseKeys = function (object) {
    return _.chain(object)
        .pairs()
        .map(function (attr) {
            return [attr[0].toLowerCase(), attr[1]];
        })
        .object()
        .value();
};
