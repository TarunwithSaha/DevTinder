// The user's OWN profile: includes their email.
function publicProfile(user) {
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    emailId: user.emailId,
    age: user.age,
    gender: user.gender,
    about: user.about,
    skills: user.skills,
    photoUrl: user.photoUrl,
  };
}

// What OTHER people may see about a user: no email, ever.
// Built field by field, so a new database field can never leak by accident.
function publicCard(user) {
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    age: user.age,
    gender: user.gender,
    about: user.about,
    skills: user.skills,
    photoUrl: user.photoUrl,
  };
}

// The fields to load when populating another user for a card
const CARD_FIELDS = "firstName lastName age gender about skills photoUrl";

module.exports = { publicProfile, publicCard, CARD_FIELDS };