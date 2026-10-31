const USERS = [
  { username: "Vaik", password: "password1" },
  { username: "Blumi", password: "password2" },
  { username: "Frax", password: "password3" },
  { username: "Lanza", password: "password4" },
  { username: "Inad", password: "password5" },
  { username: "Adam", password: "password6" },
  { username: "Paolo", password: "password7" },
];

const USERNAMES = USERS.map((user) => user.username);

module.exports = { USERS, USERNAMES };
