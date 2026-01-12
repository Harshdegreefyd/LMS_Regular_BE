import Analyser from '../models/Analyser.js';
import bcrypt from 'bcryptjs';
import { generateTokenAndSetCookie } from '../helper/getTimeForCookieExpires.js';

import { Op } from 'sequelize';

export const getAllAnalysers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = search ? {
      [Op.or]: [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ]
    } : {};

    const { count, rows } = await Analyser.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['password'] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.json({
      analysers: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createAnalyser = async (req, res) => {
  try {
    console.log("=== CREATE ANALYSER START ===");
    console.log("Request body:", req.body);

    const { name, email, password, sources, student_creation_date, source_urls, campaigns } = req.body;

    // Check what's in the database
    console.log("Checking for existing analyser with email:", email);
    const allAnalysers = await Analyser.findAll({ attributes: ['id', 'email'] });
    console.log("All analysers in DB:", allAnalysers.map(a => a.email));

    const existing = await Analyser.findOne({
      where: { email },
      attributes: ['id', 'email', 'name']
    });

    console.log("Existing analyser found:", existing);

    if (existing) {
      console.log("❌ Email already exists in database");
      return res.status(400).json({
        message: 'Email already exists',
        existing: { id: existing.id, email: existing.email, name: existing.name }
      });
    }

    console.log("✅ Email is unique, proceeding to create...");

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Password hashed successfully");

    console.log("Creating analyser with data:", {
      name,
      email,
      password: hashedPassword.substring(0, 20) + "...", // Log first 20 chars only
      sources: sources || [],
      student_creation_date: student_creation_date || "",
      source_urls: source_urls || [],
      campaigns: campaigns || []
    });

    const analyser = await Analyser.create({
      name,
      email,
      password: hashedPassword,
      sources: sources || [],
      student_creation_date: student_creation_date || "",
      source_urls: source_urls || [],
      campaigns: campaigns || []
    });

    console.log("✅ Analyser created successfully! ID:", analyser.id);

    res.status(201).json({
      id: analyser.id,
      name: analyser.name,
      email: analyser.email,
      sources: analyser.sources,
      source_urls: analyser.source_urls,
      student_creation_date: analyser.student_creation_date,
      campaigns: analyser.campaigns,
      created_at: analyser.created_at
    });

    console.log("=== CREATE ANALYSER END ===");

  } catch (error) {
    console.error("❌ ERROR in createAnalyser:");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    if (error.errors) {
      console.error("Validation errors:", error.errors.map(e => ({
        field: e.path,
        message: e.message,
        value: e.value
      })));
    }

    if (error.original) {
      console.error("Original error:", error.original);
      console.error("SQL:", error.original?.sql);
    }

    res.status(500).json({
      message: 'Server error',
      error: error.message,
      details: error.original?.message || error.errors?.[0]?.message
    });
  }
};
// export const loginAnalyser = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     if (!email || !password)
//       return res.status(400).json({ message: 'Email and password are required' });

//     const analyser = await AnalyserUser.findOne({ where: { analyser_email: email } });

//     if (!analyser)
//       return res.status(401).json({ message: 'Analyser not found' });

//     const isMatch = await bcrypt.compare(password, analyser.analyser_password);
//     if (!isMatch)
//       return res.status(401).json({ message: 'Invalid email or password' });

//     analyser.analyser_last_login = new Date();
//     await analyser.save();

//     const token = generateTokenAndSetCookie(
//       res,
//       { id: analyser.analyser_id, role: 'Analyser' }, // Default role
//       'token',
//       { expiresAtMidnight: true }
//     );

//     res.status(200).json({
//       message: 'Login successful',
//       analyser: {
//         id: analyser.analyser_id,
//         name: analyser.analyser_name,
//         email: analyser.analyser_email,
//         role: 'Analyser' // Return role in response
//       },
//       token
//     });
//   } catch (error) {
//     console.error('Login Analyser Error:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// };
export const loginAnalyser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const analyser = await Analyser.findOne({ where: { email } });
    if (!analyser) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, analyser.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    analyser.last_login = new Date();
    await analyser.save();

    const token = generateTokenAndSetCookie(
      res,
      { id: analyser.id, role: 'Analyser' },
      'token',
      { expiresAtMidnight: true }
    );

    res.status(200).json({
      message: 'Login successful',
      analyser: {
        id: analyser.id,
        name: analyser.name,
        email: analyser.email,
        role: 'Analyser'
      },
      token
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateAnalyser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, sources, source_urls, campaigns, student_creation_date } = req.body;

    const analyser = await Analyser.findByPk(id);
    if (!analyser) return res.status(404).json({ message: 'Analyser not found' });

    if (email && email !== analyser.email) {
      const existing = await Analyser.findOne({ where: { email } });
      if (existing) return res.status(400).json({ message: 'Email already exists' });
    }

    const updateData = {
      name,
      email,
      sources,
      source_urls,
      campaigns,
      student_creation_date
    };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await analyser.update(updateData);

    res.json({
      id: analyser.id,
      name: analyser.name,
      email: analyser.email,
      sources: analyser.sources,
      source_urls: analyser.source_urls,
      student_creation_date: analyser.student_creation_date,
      campaigns: analyser.campaigns,
      updated_at: analyser.updated_at
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const changeAnalyserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    const analyser = await Analyser.findByPk(id);
    if (!analyser) {
      return res.status(404).json({ message: 'Analyser not found' });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, analyser.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    analyser.password = hashedPassword;
    await analyser.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteAnalyser = async (req, res) => {
  try {
    const { id } = req.params;
    const analyser = await Analyser.findByPk(id);
    if (!analyser) return res.status(404).json({ message: 'Analyser not found' });

    await analyser.destroy();
    res.json({ message: 'Analyser deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const forceLogout = async (req, res) => {
  try {
    const { id } = req.params;
    const analyser = await Analyser.findByPk(id);
    if (!analyser) return res.status(404).json({ message: 'Analyser not found' });

    analyser.last_login = null;
    await analyser.save();

    res.json({ message: 'Force logout successful' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getUserDetails = async (req, res) => {
  try {
    console.log(req.user)
    const analyserId = req.user?.id;

    const analyser = await Analyser.findByPk(analyserId, {
      attributes: { exclude: ['password'] }
    });

    if (!analyser) {
      return res.status(404).json({ message: 'Analyser not found' });
    }

    res.json({
      success: true,
      analyser: {
        id: analyser.id,
        name: analyser.name,
        email: analyser.email,
        sources: analyser.sources,
        source_urls: analyser.source_urls,
        student_creation_date: analyser.student_creation_date,
        campaigns: analyser.campaigns,
        last_login: analyser.last_login,
        created_at: analyser.created_at,
        updated_at: analyser.updated_at
      }
    });
  } catch (error) {
    console.error('Error getting analyser details:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};