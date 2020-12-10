/*
  A valid user will have exactly one of the following identification fields: id, username, or email
 */
export const userValidator = Match.Where(function (user) {
    check(user, {
        id: Match.Optional(String),
        username: Match.Optional(String),
        email: Match.Optional(String)
    });

    if (_.keys(user).length === !1) {
        throw new Match.Error('User must have exactly one identifier field');
    }

    return true;
});

/*
  A password can be either in plain text or hashed
 */
export const passwordValidator = Match.OneOf(String, {
    digest: String,
    algorithm: String
});

/*
  Return a MongoDB query selector for finding the given user
 */
export const getUserQuerySelector = function (user) {
    if (user.id) {
        return {
            '_id': user.id
        };
    } else if (user.username) {
        return {
            'username': user.username
        };
    } else if (user.email) {
        return {
            'emails.address': user.email
        };
    }

    throw new Error('Cannot create selector from invalid user');
};
