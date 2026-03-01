const lockSession = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ locked: true });
  }

  req.session.user.is_locked = true;

  res.json({
    success: true,
    locked: true,
  });
};
const profile = (req, res) => {
  if (!req.session.user) {
    return res.json({
      success: true,
      loggedIn: false,
      locked: true,
    });
  }

  return res.json({
    success: true,
    loggedIn: true,
    locked: req.session.user.is_locked === true,
    user: req.session.user,
  });
};
