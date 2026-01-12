import { FilterOptions, Student, StudentRemark, StudentLeadActivity, AnalyserUser } from '../models/index.js';
import { Sequelize, Op } from 'sequelize'; // Added Op import

export const createFilterOptions = async (req, res) => {
  try {
    const data = req.body;

    const newFilter = await FilterOptions.create(data);

    return res.status(201).json({
      success: true,
      message: 'Filter options created successfully',
      data: newFilter
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to create filter options',
      error: error.message
    });
  }
};

export const getLeadOptions = async (req, res) => {
  try {
    const userRole = req?.user?.role;
    const userId = req?.user?.id;
    const isAnalyser = userRole?.toLowerCase() === 'analyser';

    let analyser = null;

    if (isAnalyser) {
      analyser = await AnalyserUser.findByPk(userId, {
        attributes: ['sources']
      });

      if (!analyser) {
        return res.status(404).json({
          success: false,
          message: 'Analyser not found'
        });
      }
    }

    const [
      modes,
      leadStatuses,
      subLeadStatuses,
      callingStatuses,
      subCallingStatuses
    ] = await Promise.all([
      Student.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('mode')), 'mode']],
        raw: true
      }),
      StudentRemark.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('lead_status')), 'lead_status']],
        raw: true
      }),
      StudentRemark.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('lead_sub_status')), 'lead_sub_status']],
        raw: true
      }),
      StudentRemark.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('calling_status')), 'calling_status']],
        raw: true
      }),
      StudentRemark.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('sub_calling_status')), 'sub_calling_status']],
        raw: true
      }),
    ]);

    let sources = [];
    let sourceUrls = [];
    let campaigns = [];

    if (isAnalyser) {
      // ✅ Only allowed sources
      sources = analyser.sources || [];

      if (sources.length) {
        [sourceUrls, campaigns] = await Promise.all([
          StudentLeadActivity.findAll({
            attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('source_url')), 'source_url']],
            where: {
              source: { [Op.in]: sources }
            },
            raw: true
          }),
          StudentLeadActivity.findAll({
            attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('utm_campaign')), 'utm_campaign']],
            where: {
              source: { [Op.in]: sources }
            },
            raw: true
          })
        ]);
      }
    } else {
      // 🔹 Admin / Others
      [sources, sourceUrls, campaigns] = await Promise.all([
        StudentLeadActivity.findAll({
          attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('source')), 'source']],
          raw: true
        }),
        StudentLeadActivity.findAll({
          attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('source_url')), 'source_url']],
          raw: true
        }),
        StudentLeadActivity.findAll({
          attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('utm_campaign')), 'utm_campaign']],
          raw: true
        })
      ]);
    }

    const format = (arr, key) =>
      arr?.map(item => item[key]).filter(Boolean);

    const response = {
      mode: format(modes, 'mode'),
      source: isAnalyser ? sources : format(sources, 'source'),
      first_source_url: format(sourceUrls, 'source_url'),
      campaign_name: format(campaigns, 'utm_campaign'),
      lead_status: format(leadStatuses, 'lead_status'),
      sub_lead_status: format(subLeadStatuses, 'lead_sub_status'),
      calling_status: format(callingStatuses, 'calling_status'),
      calling_sub_status: format(subCallingStatuses, 'sub_calling_status'),
    };

    if (isAnalyser) {
      response.note = 'Filter options restricted to analyser assigned sources';
      response.data_limited = true;
    }

    return res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error in getLeadOptions:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching filter options',
      error: error.message
    });
  }
};
