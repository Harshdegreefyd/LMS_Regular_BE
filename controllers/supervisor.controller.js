import { Counsellor, Supervisor } from '../models/index.js';
import bcrypt from 'bcryptjs';
import { generateTokenAndSetCookie } from '../helper/getTimeForCookieExpires.js';

export const registerSupervisor = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existing = await Supervisor.findOne({
      where: {
        supervisor_email: email
      }
    });

    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newSupervisor = await Supervisor.create({
      supervisor_name: name,
      supervisor_email: email,
      supervisor_password: hashedPassword
    });

    const token = generateTokenAndSetCookie(
      res,
      {
        id: newSupervisor.supervisor_id,
        role: 'Supervisor',
        name: newSupervisor.supervisor_name
      },
      'token',
      { expiresAtMidnight: false }
    );

    res.status(201).json({
      message: 'Registration successful',
      supervisor: {
        id: newSupervisor.supervisor_id,
        name: newSupervisor.supervisor_name,
        email: newSupervisor.supervisor_email,
      },
      token
    });
  } catch (error) {
    console.error('Register Supervisor Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const loginSupervisor = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' });

    const supervisor = await Supervisor.findOne({ where: { supervisor_email: email } });
    console.log(supervisor)
    if (!supervisor)
      return res.status(401).json({ message: 'Supervisor not found' });

    const isMatch = await bcrypt.compare(password, supervisor.supervisor_password);
    if (!isMatch)
      return res.status(401).json({ message: 'Invalid email or password' });

    // Update last login time
    await Supervisor.update({
      supervisor_last_login: new Date(),
      is_logout: false
    }, {
      where: { supervisor_id: supervisor.supervisor_id }
    });

    const token = generateTokenAndSetCookie(
      res,
      {
        id: supervisor.supervisor_id,
        role: 'Supervisor',
        name: supervisor.supervisor_name
      },
      'token',
      { expiresAtMidnight: false }
    );

    res.status(200).json({
      message: 'Login successful',
      supervisor: {
        id: supervisor.supervisor_id,
        name: supervisor.supervisor_name,
        email: supervisor.supervisor_email,
        role: 'Supervisor',
        status: supervisor.status
      },
      token,
    });
  } catch (error) {
    console.error('Login Supervisor Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [updated] = await Supervisor.update(
      { supervisor_password: hashedPassword },
      { where: { supervisor_id: userId } }
    );

    if (updated === 0) {
      return res.status(404).json({ message: 'Supervisor not found' });
    }

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change Password Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const logoutSupervisor = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (userId) {
      await Supervisor.update({
        is_logout: true
      }, {
        where: { supervisor_id: userId }
      });
    }

    res.clearCookie('token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });

    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getUserDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await Supervisor.findByPk(userId, {
      attributes: { exclude: ['supervisor_password'] },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get User Details Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const logoutFromAllDevices = async (req, res) => {
  try {
    const { id } = req.params;
    
    await Supervisor.update({
      is_logout: true
    }, {
      where: { supervisor_id: id }
    });

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error in logoutFromAllDevices:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const makeSupervisorLogout = async (req, res) => {
  try {
    const { supervisor_id } = req.params;
    const [updated] = await Supervisor.update(
      { 
        is_logout: true
      },
      { where: { supervisor_id: supervisor_id } }
    );
    res.status(200).json({ message: 'Supervisor logged out successfully' });

  } catch (error) {
    console.error('Error in making Logout :', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

