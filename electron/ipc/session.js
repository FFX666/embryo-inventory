let currentUser = null

module.exports = {
  set: (u) => { currentUser = u },
  get: () => currentUser
}
