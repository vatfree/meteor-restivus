import { Accounts } from 'meteor/accounts-base';
import { userValidator, passwordValidator, getUserQuerySelector } from './auth-helpers';

export const Auth = {};

/*
  Log a user in with their password
 */
Auth.loginWithPassword = function (user, password) {
    check(user, userValidator);
    check(password, passwordValidator);
    if (!user || !password) {
        throw new Meteor.Error(401, 'Unauthorized');
    }

    const authenticatingUserSelector = getUserQuerySelector(user);
    const authenticatingUser = Meteor.users.findOne(authenticatingUserSelector);
    if (!authenticatingUser) {
        throw new Meteor.Error(401, 'Unauthorized');
    }

    let ref;
    if (!((ref = authenticatingUser.services) != null ? ref.password : void 0)) {
        throw new Meteor.Error(401, 'Unauthorized');
    }

    const passwordVerification = Accounts._checkPassword(authenticatingUser, password);
    if (passwordVerification.error) {
        throw new Meteor.Error(401, 'Unauthorized');
    }

    const authToken = Accounts._generateStampedLoginToken();
    const hashedToken = Accounts._hashLoginToken(authToken.token);
    Accounts._insertHashedLoginToken(authenticatingUser._id, {
        hashedToken: hashedToken
    });

    return {
        authToken: authToken.token,
        userId: authenticatingUser._id
    };
};
