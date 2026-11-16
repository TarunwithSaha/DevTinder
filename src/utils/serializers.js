// The shape of a user that is allowed to leave the server.
// Built field by field, so a new database field can never leak by accident.
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

module.exports = { publicProfile };