import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';
import { v4 as uuidv4 } from 'uuid';

const ReconAssignmentRule = sequelize.define('recon_assignment_rulesets', {
  lead_assignment_rule_recon_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    unique: true,
    allowNull: false
  },
  conditions: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  assigned_university_names: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: []
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  round_robin_index: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_matched_leads: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  last_matched_at: {
    type: DataTypes.DATE,
    defaultValue: null
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  custom_rule_name: {
    type: DataTypes.STRING,
    defaultValue: ''
  }
}, {
  timestamps: false,
  underscored: true,
  freezeTableName: true
});

ReconAssignmentRule.generateRuleName = async function () {
  let ruleName;
  let exists = true;

  while (exists) {
    const randomString = uuidv4().slice(0, 6);
    ruleName = `Rule_${randomString}`;
    exists = await ReconAssignmentRule.findOne({ where: { name: ruleName } });
  }

  return ruleName;
};

ReconAssignmentRule.prototype.getNextUniversity = function () {
  const list = this.assigned_university_names;
  if (!list || list.length === 0) return null;

  const index = this.round_robin_index || 0;
  const nextUniversity = list[index];

  // Advance index circularly
  this.round_robin_index = (index + 1) % list.length;

  return nextUniversity;
};

export default ReconAssignmentRule;