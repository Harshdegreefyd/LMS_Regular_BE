// models/l3AssignmentRuleset.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js'; 
import { v4 as uuidv4 } from 'uuid';

const L3AssignmentRuleset = sequelize.define('l3_assignment_rulesets', {
  l3_assignment_rulesets_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
 
  name: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  college: {
    type: DataTypes.STRING(255),
    defaultValue: ''
  },
  university_name: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: []
  },
  course_conditions: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  source: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: []
  },
  assigned_counsellor_ids: {
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


// ✅ Static Method to Generate Unique Rule Name
L3AssignmentRuleset.generateRuleName = async function () {
  let ruleName;
  let exists = true;

  while (exists) {
    const randomString = uuidv4().slice(0, 6);
    ruleName = `Rule_${randomString}`;
    exists = await L3AssignmentRuleset.findOne({ where: { name: ruleName } });
  }

  return ruleName;
};


// ✅ Instance Method for Round-Robin Assignment
L3AssignmentRuleset.prototype.getNextCounsellor = function () {
  const list = this.assiged_counsellor_ids;
  if (!list || list.length === 0) return null;

  const index = this.round_robin_index || 0;
  const nextCounsellor = list[index];

  this.round_robin_index = (index + 1) % list.length;

  return nextCounsellor;
};


// ✅ Hook to auto-generate name if empty
L3AssignmentRuleset.beforeSave((ruleset) => {
  if (!ruleset.name || ruleset.name.trim() === '') {
    ruleset.name = `ruleset-${Date.now()}`;
  }
});

export default L3AssignmentRuleset;
