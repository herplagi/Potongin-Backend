const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    // Convert to array if single role provided
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    
    const user = req.user;
    
    // ✅ UPDATED: Check based on flags for multi-role support
    const hasAccess = rolesArray.some(role => {
      switch(role) {
        case 'customer':
          return user.is_customer === true;
        case 'owner':
          return user.is_owner === true;
        case 'admin':
          return user.role === 'admin';
        default:
          return user.role === role;
      }
    });

    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Akses ditolak. Anda tidak memiliki hak akses yang diperlukan.'
      });
    }

    next();
  };
};

module.exports = checkRole;