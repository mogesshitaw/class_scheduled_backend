const sessionAuth = (req, res, next) => {
  console.log('🔐 Session check - user:', req.session.user);
  console.log('🔐 Session ID:', req.sessionID);
  console.log('🔐 Session keys:', Object.keys(req.session));
  
  if (req.session.user) {
    req.user = req.session.user;
    console.log('✅ Session authenticated - User:', {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      department_id: req.user.department_id
    });
    next();
  } else {
    console.log('❌ No session user found');
    res.status(401).json({ 
      success: false,
      error: 'Not authenticated. Please login first.' 
    });
  }
};

// Optional: Instructor-only middleware
const instructorAuth = (req, res, next) => {
  console.log('👮 Instructor check - User role:', req.user?.role);
  
  if (req.user && req.user.role === 'instructor') {
    console.log('✅ Instructor authorized');
    next();
  } else {
    console.log('❌ Instructor access required');
    res.status(403).json({ 
      success: false,
      error: 'Instructor access required' 
    });
  }
};

// Admin-only middleware
const adminAuth = (req, res, next) => {
  console.log('👑 Admin check - User role:', req.user?.role);
  
  if (req.user && req.user.role === 'admin') {
    console.log('✅ Admin authorized');
    next();
  } else {
    console.log('❌ Admin access required');
    res.status(403).json({ 
      success: false,
      error: 'Admin access required' 
    });
  }
};

module.exports = { sessionAuth, instructorAuth, adminAuth };