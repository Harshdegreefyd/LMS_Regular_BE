import UniversitiesAPIHeader from '../models/university_header.js';
import { Op } from 'sequelize';

export const getUniversityHeaders = async (req, res) => {
  try {
    const { universityName } = req.params;

    const universityHeader = await UniversitiesAPIHeader.findOne({
      where: { university_name: universityName },
    });

    if (!universityHeader) {
      return res.status(200).json({ headers: {} });
    }

    return res.status(200).json(universityHeader);
  } catch (error) {
    console.error('Error getting university headers:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Create or update headers for a university
export const saveUniversityHeaders = async (req, res) => {
  try {
    const { universityName, headers } = req.body;

    if (!universityName || typeof headers !== 'object') {
      return res.status(400).json({
        message: 'University name and headers object are required',
      });
    }

    const [record] = await UniversitiesAPIHeader.upsert({
      university_name: universityName,
      headers,
    }, { returning: true });

    return res.status(200).json(record);
  } catch (error) {
    console.error('Error saving university headers:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete headers for a university
export const deleteUniversityHeaders = async (req, res) => {
  try {
    const { universityName } = req.params;

    const deleted = await UniversitiesAPIHeader.destroy({
      where: { university_name: universityName },
    });

    if (!deleted) {
      return res.status(404).json({ message: 'University headers not found' });
    }

    return res.status(200).json({ message: 'University headers deleted successfully' });
  } catch (error) {
    console.error('Error deleting university headers:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Add a new header-value pair
export const addHeaderValue = async (req, res) => {
  try {
    const { universityName } = req.params;
    const { headerName, value } = req.body;

    if (!headerName || value === undefined) {
      return res.status(400).json({
        message: 'Header name and value are required',
      });
    }

    let universityHeader = await UniversitiesAPIHeader.findOne({
      where: { university_name: universityName },
    });

    if (!universityHeader) {
      universityHeader = await UniversitiesAPIHeader.create({
        university_name: universityName,
        headers: { [headerName]: value },
      });
    } else {
      const updatedHeaders = { ...(universityHeader.headers || {}), [headerName]: value };
      await universityHeader.update({ headers: updatedHeaders });
    }

    return res.status(200).json(universityHeader);
  } catch (error) {
    console.error('Error adding header value:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete a specific header
export const deleteHeader = async (req, res) => {
  try {
    const { universityName, headerName } = req.params;

    const universityHeader = await UniversitiesAPIHeader.findOne({
      where: { university_name: universityName },
    });

    if (!universityHeader) {
      return res.status(404).json({ message: 'University headers not found' });
    }

    const updatedHeaders = { ...(universityHeader.headers || {}) };
    if (!(headerName in updatedHeaders)) {
      return res.status(404).json({ message: 'Header not found' });
    }

    delete updatedHeaders[headerName];
    await universityHeader.update({ headers: updatedHeaders });

    return res.status(200).json({
      message: 'Header deleted successfully',
      universityHeader,
    });
  } catch (error) {
    console.error('Error deleting header:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
