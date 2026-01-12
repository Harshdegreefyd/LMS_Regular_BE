import { Sequelize, Op } from 'sequelize';
import sequelize from '../config/database-config.js';

// Complete and optimized single raw SQL query for all stats
export const getOptimizedOverallStats = async (filters) => {
  try {
    const {
      whereConditions,
      remarkIncludeWhere, 
      utmIncludeWhere,
    } = filters;

    console.log('DEBUG - Input conditions:');
    console.log(filters,'applied filters')
    console.log('whereConditions:', JSON.stringify(whereConditions, null, 2));
    console.log('remarkIncludeWhere:', JSON.stringify(remarkIncludeWhere, null, 2));
    console.log('utmIncludeWhere:', JSON.stringify(utmIncludeWhere, null, 2));

    // Convert Sequelize conditions to raw SQL with proper parameter handling
    const { sqlWhere: studentSqlWhere, replacements: studentReplacements } = 
      buildRawSqlConditions(whereConditions, 's');
    
    const { sqlWhere: remarkSqlWhere, replacements: remarkReplacements } = 
      buildRawSqlConditions(remarkIncludeWhere, 'sr');
    
    const { sqlWhere: utmSqlWhere, replacements: utmReplacements } = 
      buildRawSqlConditions(utmIncludeWhere, 'sla');

    // Combine all replacements with unique prefixes
    const allReplacements = { 
      ...prefixReplacements(studentReplacements, 'student_'),
      ...prefixReplacements(remarkReplacements, 'remark_'), 
      ...prefixReplacements(utmReplacements, 'utm_')
    };

    // Update SQL where clauses to use prefixed parameters
    const prefixedStudentSqlWhere = prefixParametersInSql(studentSqlWhere, 'student_');
    const prefixedRemarkSqlWhere = prefixParametersInSql(remarkSqlWhere, 'remark_');
    const prefixedUtmSqlWhere = prefixParametersInSql(utmSqlWhere, 'utm_');

    // Add today's date parameters
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    allReplacements.todayStart = today;
    allReplacements.todayEnd = tomorrow;

    console.log('DEBUG - Generated SQL conditions:');
    console.log('Student WHERE:', prefixedStudentSqlWhere);
    console.log('Remark WHERE:', prefixedRemarkSqlWhere);
    console.log('UTM WHERE:', prefixedUtmSqlWhere);
    console.log('All Replacements:', allReplacements);

    // Build the comprehensive raw SQL query with proper table/column names
    const query = `
      WITH base_students AS (
        SELECT DISTINCT s.student_id,
               s.number_of_unread_messages,
               s.created_at as student_created_at
        FROM students s
        ${Object.keys(utmIncludeWhere).length > 0 ? `
          INNER JOIN student_lead_activities sla ON s.student_id = sla.student_id
          AND (${prefixedUtmSqlWhere})
        ` : ''}
        WHERE (${prefixedStudentSqlWhere})
      ),
      
      fresh_leads AS (
        SELECT bs.student_id
        FROM base_students bs
        LEFT JOIN student_remarks sr ON bs.student_id = sr.student_id
        WHERE sr.student_id IS NULL
      ),
      
      today_callbacks AS (
        SELECT DISTINCT bs.student_id
        FROM base_students bs
        INNER JOIN student_remarks sr ON bs.student_id = sr.student_id
        WHERE (${Object.keys(remarkIncludeWhere).length > 0 ? prefixedRemarkSqlWhere : '1=1'})
          AND sr.callback_date >= :todayStart 
          AND sr.callback_date < :todayEnd
      ),
      
      latest_remarks AS (
        SELECT DISTINCT ON (sr.student_id) 
          sr.student_id,
          sr.calling_status,
          sr.sub_calling_status,
          sr.created_at
        FROM student_remarks sr
        INNER JOIN base_students bs ON sr.student_id = bs.student_id
        ${Object.keys(remarkIncludeWhere).length > 0 ? `WHERE (${prefixedRemarkSqlWhere})` : ''}
        ORDER BY sr.student_id, sr.created_at DESC
      ),
      
      intent_stats AS (
        SELECT 
          COUNT(CASE WHEN LOWER(TRIM(COALESCE(lr.sub_calling_status, ''))) = 'hot' THEN 1 END) as hot_leads,
          COUNT(CASE WHEN LOWER(TRIM(COALESCE(lr.sub_calling_status, ''))) = 'warm' THEN 1 END) as warm_leads,
          COUNT(CASE WHEN LOWER(TRIM(COALESCE(lr.sub_calling_status, ''))) = 'cold' THEN 1 END) as cold_leads,
          COUNT(CASE WHEN LOWER(TRIM(COALESCE(lr.calling_status, ''))) = 'not connected' THEN 1 END) as not_connected
        FROM latest_remarks lr
      ),
      
      unread_messages AS (
        SELECT COALESCE(SUM(COALESCE(bs.number_of_unread_messages, 0)), 0) as total_unread_messages
        FROM base_students bs
      )
      
      SELECT 
        
        (SELECT COUNT(*) FROM fresh_leads) as fresh_leads,
        (SELECT COUNT(*) FROM today_callbacks) as today_callbacks,
        COALESCE(ints.hot_leads, 0) as intent_hot,
        COALESCE(ints.warm_leads, 0) as intent_warm,
        COALESCE(ints.cold_leads, 0) as intent_cold,
        COALESCE(ints.not_connected, 0) as not_connected_yet,
        COALESCE(um.total_unread_messages, 0) as all_unread_messages_count
      FROM intent_stats ints
      CROSS JOIN unread_messages um;
    `;

    console.log('Final Query:', query);
    console.log('Final Replacements:', allReplacements);

    console.time('optimizedStatsQuery');
    const results = await sequelize.query(query, { 
      replacements: allReplacements,
      type: sequelize.QueryTypes.SELECT 
    });
    console.timeEnd('optimizedStatsQuery');

    console.log('Raw query results:', results);
    const result = results[0] || {};

    const response = {
      total: 0,
      freshLeads: Object.keys(remarkIncludeWhere).length>0 ? 0 :  parseInt(result.fresh_leads) || 0,
      todayCallbacks: parseInt(result.today_callbacks) || 0,
      intentHot: parseInt(result.intent_hot) || 0,
      intentWarm: parseInt(result.intent_warm) || 0,
      intentCold: parseInt(result.intent_cold) || 0,
      notConnectedYet: parseInt(result.not_connected_yet) || 0,
      allUnreadMessagesCount: parseInt(result.all_unread_messages_count) || 0
    };

    console.log('Final stats result:', response);
    return response;

  } catch (error) {
    console.error('Failed to fetch optimized overall stats:', error);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to fetch optimized overall stats: ${error.message}`);
  }
};

// Helper function to prefix replacements to avoid conflicts
const prefixReplacements = (replacements, prefix) => {
  const prefixed = {};
  for (const [key, value] of Object.entries(replacements)) {
    prefixed[`${prefix}${key}`] = value;
  }
  return prefixed;
};

// Helper function to update parameter references in SQL
const prefixParametersInSql = (sql, prefix) => {
  return sql.replace(/:(\w+)/g, `:${prefix}$1`);
};

// COMPLETE buildRawSqlConditions with ALL Sequelize operators supported
const buildRawSqlConditions = (conditions, tableAlias = '') => {
  if (!conditions || Object.keys(conditions).length === 0) {
    return { sqlWhere: '1=1', replacements: {} };
  }

  const sqlParts = [];
  const replacements = {};
  let paramCounter = 0;

  const getParamName = () => `param_${++paramCounter}`;
  const getTablePrefix = () => tableAlias ? `${tableAlias}.` : '';

  // Helper function to get symbol key by checking symbol description
  const getSymbolKey = (obj, symbolName) => {
    return Object.getOwnPropertySymbols(obj).find(sym => {
      const description = sym.toString();
      return description.includes(symbolName) || description.includes(symbolName.toLowerCase());
    });
  };

  // Helper function to get operator value (handles both regular props and symbols)
  const getOperatorValue = (obj, opKey, symbolName) => {
    if (obj.hasOwnProperty(opKey)) return obj[opKey];
    const symbolKey = getSymbolKey(obj, symbolName);
    return symbolKey ? obj[symbolKey] : undefined;
  };

  const processCondition = (key, value) => {
    const prefix = getTablePrefix();
    
    // Skip Sequelize.literal conditions
    if (value && typeof value === 'object' && value.val && typeof value.val === 'string') {
      console.warn(`Skipping Sequelize.literal condition for key: ${key}`);
      return '1=1';
    }
    
    if (value === null || value === undefined) {
      return `${prefix}${key} IS NULL`;
    }
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      
      // === LOGICAL OPERATORS ===
      
      // OR operator
      const orValue = getOperatorValue(value, Op.or, 'or');
      if (orValue !== undefined) {
        const orConditions = Array.isArray(orValue) ? orValue : [orValue];
        const orParts = [];
        
        for (const orCondition of orConditions) {
          if (typeof orCondition === 'object' && orCondition !== null) {
            const nestedResult = buildRawSqlConditions({ [key]: orCondition }, tableAlias);
            if (nestedResult.sqlWhere !== '1=1') {
              orParts.push(nestedResult.sqlWhere);
              Object.assign(replacements, nestedResult.replacements);
            }
          }
        }
        
        if (orParts.length > 0) {
          return `(${orParts.join(' OR ')})`;
        }
        return '1=1';
      }

      // AND operator
      const andValue = getOperatorValue(value, Op.and, 'and');
      if (andValue !== undefined) {
        const andConditions = Array.isArray(andValue) ? andValue : [andValue];
        const andParts = [];
        
        for (const andCondition of andConditions) {
          if (typeof andCondition === 'object' && andCondition !== null) {
            const nestedResult = buildRawSqlConditions({ [key]: andCondition }, tableAlias);
            if (nestedResult.sqlWhere !== '1=1') {
              andParts.push(nestedResult.sqlWhere);
              Object.assign(replacements, nestedResult.replacements);
            }
          }
        }
        
        if (andParts.length > 0) {
          return `(${andParts.join(' AND ')})`;
        }
        return '1=1';
      }

      // === COMPARISON OPERATORS ===
      
      // Equal
      const eqValue = getOperatorValue(value, Op.eq, 'eq');
      if (eqValue !== undefined) {
        if (eqValue === null) return `${prefix}${key} IS NULL`;
        const paramName = getParamName();
        replacements[paramName] = eqValue;
        return `${prefix}${key} = :${paramName}`;
      }

      // Not equal
      const neValue = getOperatorValue(value, Op.ne, 'ne');
      if (neValue !== undefined) {
        if (neValue === null) return `${prefix}${key} IS NOT NULL`;
        const paramName = getParamName();
        replacements[paramName] = neValue;
        return `${prefix}${key} != :${paramName}`;
      }

      // Greater than
      const gtValue = getOperatorValue(value, Op.gt, 'gt');
      if (gtValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = gtValue;
        return `${prefix}${key} > :${paramName}`;
      }

      // Greater than or equal
      const gteValue = getOperatorValue(value, Op.gte, 'gte');
      if (gteValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = gteValue;
        return `${prefix}${key} >= :${paramName}`;
      }

      // Less than
      const ltValue = getOperatorValue(value, Op.lt, 'lt');
      if (ltValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = ltValue;
        return `${prefix}${key} < :${paramName}`;
      }

      // Less than or equal
      const lteValue = getOperatorValue(value, Op.lte, 'lte');
      if (lteValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = lteValue;
        return `${prefix}${key} <= :${paramName}`;
      }

      // === ARRAY/LIST OPERATORS ===
      
      // IN
      const inValue = getOperatorValue(value, Op.in, 'in');
      if (inValue !== undefined) {
        const inValues = Array.isArray(inValue) ? inValue : [inValue];
        if (inValues.length === 0) return '1=0';
        if (inValues.length === 1) {
          const paramName = getParamName();
          replacements[paramName] = inValues[0];
          return `${prefix}${key} = :${paramName}`;
        }
        const paramName = getParamName();
        replacements[paramName] = inValues;
        return `${prefix}${key} = ANY(:${paramName})`;
      }

      // NOT IN
      const notInValue = getOperatorValue(value, Op.notIn, 'notIn');
      if (notInValue !== undefined) {
        const notInValues = Array.isArray(notInValue) ? notInValue : [notInValue];
        if (notInValues.length === 0) return '1=1';
        const paramName = getParamName();
        replacements[paramName] = notInValues;
        return `${prefix}${key} != ALL(:${paramName})`;
      }

      // ANY
      const anyValue = getOperatorValue(value, Op.any, 'any');
      if (anyValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = Array.isArray(anyValue) ? anyValue : [anyValue];
        return `${prefix}${key} = ANY(:${paramName})`;
      }

      // ALL
      const allValue = getOperatorValue(value, Op.all, 'all');
      if (allValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = Array.isArray(allValue) ? allValue : [allValue];
        return `${prefix}${key} = ALL(:${paramName})`;
      }

      // === STRING OPERATORS ===
      
      // LIKE
      const likeValue = getOperatorValue(value, Op.like, 'like');
      if (likeValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = likeValue;
        return `${prefix}${key} LIKE :${paramName}`;
      }

      // NOT LIKE
      const notLikeValue = getOperatorValue(value, Op.notLike, 'notLike');
      if (notLikeValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = notLikeValue;
        return `${prefix}${key} NOT LIKE :${paramName}`;
      }

      // ILIKE (case insensitive like)
      const iLikeValue = getOperatorValue(value, Op.iLike, 'iLike');
      if (iLikeValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = iLikeValue;
        return `${prefix}${key} ILIKE :${paramName}`;
      }

      // NOT ILIKE
      const notILikeValue = getOperatorValue(value, Op.notILike, 'notILike');
      if (notILikeValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = notILikeValue;
        return `${prefix}${key} NOT ILIKE :${paramName}`;
      }

      // REGEXP
      const regexpValue = getOperatorValue(value, Op.regexp, 'regexp');
      if (regexpValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = regexpValue;
        return `${prefix}${key} ~ :${paramName}`;
      }

      // NOT REGEXP
      const notRegexpValue = getOperatorValue(value, Op.notRegexp, 'notRegexp');
      if (notRegexpValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = notRegexpValue;
        return `${prefix}${key} !~ :${paramName}`;
      }

      // IREGEXP (case insensitive regexp)
      const iRegexpValue = getOperatorValue(value, Op.iRegexp, 'iRegexp');
      if (iRegexpValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = iRegexpValue;
        return `${prefix}${key} ~* :${paramName}`;
      }

      // NOT IREGEXP
      const notIRegexpValue = getOperatorValue(value, Op.notIRegexp, 'notIRegexp');
      if (notIRegexpValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = notIRegexpValue;
        return `${prefix}${key} !~* :${paramName}`;
      }

      // === RANGE OPERATORS ===
      
      // BETWEEN
      const betweenValue = getOperatorValue(value, Op.between, 'between');
      if (betweenValue !== undefined) {
        if (!Array.isArray(betweenValue) || betweenValue.length !== 2) {
          console.error(`Invalid BETWEEN values for ${key}:`, betweenValue);
          return '1=1';
        }
        const paramName1 = getParamName();
        const paramName2 = getParamName();
        replacements[paramName1] = betweenValue[0];
        replacements[paramName2] = betweenValue[1];
        return `${prefix}${key} BETWEEN :${paramName1} AND :${paramName2}`;
      }

      // NOT BETWEEN
      const notBetweenValue = getOperatorValue(value, Op.notBetween, 'notBetween');
      if (notBetweenValue !== undefined) {
        if (!Array.isArray(notBetweenValue) || notBetweenValue.length !== 2) {
          console.error(`Invalid NOT BETWEEN values for ${key}:`, notBetweenValue);
          return '1=1';
        }
        const paramName1 = getParamName();
        const paramName2 = getParamName();
        replacements[paramName1] = notBetweenValue[0];
        replacements[paramName2] = notBetweenValue[1];
        return `${prefix}${key} NOT BETWEEN :${paramName1} AND :${paramName2}`;
      }

      // === POSTGRESQL SPECIFIC OPERATORS ===
      
      // OVERLAP (for arrays)
      const overlapValue = getOperatorValue(value, Op.overlap, 'overlap');
      if (overlapValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = overlapValue;
        return `${prefix}${key} && :${paramName}`;
      }

      // CONTAINS (for arrays/JSON)
      const containsValue = getOperatorValue(value, Op.contains, 'contains');
      if (containsValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = containsValue;
        return `${prefix}${key} @> :${paramName}`;
      }

      // CONTAINED (for arrays/JSON)
      const containedValue = getOperatorValue(value, Op.contained, 'contained');
      if (containedValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = containedValue;
        return `${prefix}${key} <@ :${paramName}`;
      }

      // ADJACENT (for ranges)
      const adjacentValue = getOperatorValue(value, Op.adjacent, 'adjacent');
      if (adjacentValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = adjacentValue;
        return `${prefix}${key} -|- :${paramName}`;
      }

      // STRICTLY LEFT (for ranges)
      const strictlyLeftValue = getOperatorValue(value, Op.strictlyLeft, 'strictlyLeft');
      if (strictlyLeftValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = strictlyLeftValue;
        return `${prefix}${key} << :${paramName}`;
      }

      // STRICTLY RIGHT (for ranges)
      const strictlyRightValue = getOperatorValue(value, Op.strictlyRight, 'strictlyRight');
      if (strictlyRightValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = strictlyRightValue;
        return `${prefix}${key} >> :${paramName}`;
      }

      // NO EXTENDS RIGHT (for ranges)
      const noExtendsRightValue = getOperatorValue(value, Op.noExtendsRight, 'noExtendsRight');
      if (noExtendsRightValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = noExtendsRightValue;
        return `${prefix}${key} &< :${paramName}`;
      }

      // NO EXTENDS LEFT (for ranges)
      const noExtendsLeftValue = getOperatorValue(value, Op.noExtendsLeft, 'noExtendsLeft');
      if (noExtendsLeftValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = noExtendsLeftValue;
        return `${prefix}${key} &> :${paramName}`;
      }

      // === SPECIAL OPERATORS ===
      
      // NOT
      const notValue = getOperatorValue(value, Op.not, 'not');
      if (notValue !== undefined) {
        if (notValue === null) return `${prefix}${key} IS NOT NULL`;
        const nestedResult = buildRawSqlConditions({ [key]: notValue }, tableAlias);
        if (nestedResult.sqlWhere !== '1=1') {
          Object.assign(replacements, nestedResult.replacements);
          return `NOT (${nestedResult.sqlWhere})`;
        }
        return '1=1';
      }

      // IS
      const isValue = getOperatorValue(value, Op.is, 'is');
      if (isValue !== undefined) {
        if (isValue === null) return `${prefix}${key} IS NULL`;
        const paramName = getParamName();
        replacements[paramName] = isValue;
        return `${prefix}${key} IS :${paramName}`;
      }

      // VALUES (for bulk operations)
      const valuesValue = getOperatorValue(value, Op.values, 'values');
      if (valuesValue !== undefined) {
        const paramName = getParamName();
        replacements[paramName] = valuesValue;
        return `${prefix}${key} IN :${paramName}`;
      }

      // COL (for column references)
      const colValue = getOperatorValue(value, Op.col, 'col');
      if (colValue !== undefined) {
        return `${prefix}${key} = ${colValue}`;
      }
    }
    
    // Handle arrays as IN clause
    if (Array.isArray(value)) {
      if (value.length === 0) return '1=0';
      if (value.length === 1) {
        const paramName = getParamName();
        replacements[paramName] = value[0];
        return `${prefix}${key} = :${paramName}`;
      }
      const paramName = getParamName();
      replacements[paramName] = value;
      return `${prefix}${key} = ANY(:${paramName})`;
    }
    
    // Handle simple values
    const paramName = getParamName();
    replacements[paramName] = value;
    return `${prefix}${key} = :${paramName}`;
  };

  const processConditions = (conditions) => {
    for (const [key, value] of Object.entries(conditions)) {
      // Handle Symbol-based operators at top level
      const orSymbol = getSymbolKey(conditions, 'or');
      const andSymbol = getSymbolKey(conditions, 'and');
      
      if (key === Op.and || key === andSymbol) {
        const andConditions = Array.isArray(value) ? value : [value];
        const andParts = [];
        
        for (const andCondition of andConditions) {
          if (typeof andCondition === 'object' && andCondition !== null) {
            // Check if this is a Sequelize.literal
            if (andCondition.val && typeof andCondition.val === 'string') {
              console.warn('Skipping Sequelize.literal in AND condition');
              continue;
            }
            
            const subResult = buildRawSqlConditions(andCondition, tableAlias);
            if (subResult.sqlWhere !== '1=1') {
              andParts.push(`(${subResult.sqlWhere})`);
              Object.assign(replacements, subResult.replacements);
            }
          }
        }
        
        if (andParts.length > 0) {
          sqlParts.push(`(${andParts.join(' AND ')})`);
        }
      } else if (key === Op.or || key === orSymbol) {
        const orConditions = Array.isArray(value) ? value : [value];
        const orParts = [];
        
        for (const orCondition of orConditions) {
          if (typeof orCondition === 'object' && orCondition !== null) {
            const subResult = buildRawSqlConditions(orCondition, tableAlias);
            if (subResult.sqlWhere !== '1=1') {
              orParts.push(`(${subResult.sqlWhere})`);
              Object.assign(replacements, subResult.replacements);
            }
          }
        }
        
        if (orParts.length > 0) {
          sqlParts.push(`(${orParts.join(' OR ')})`);
        }
      } else {
        // Handle regular field conditions
        try {
          const condition = processCondition(key, value);
          if (condition && condition !== '1=1') {
            sqlParts.push(condition);
          }
        } catch (error) {
          console.error(`Error processing condition for key ${key}:`, error);
          // Continue processing other conditions
        }
      }
    }
  };

  processConditions(conditions);

  return {
    sqlWhere: sqlParts.length > 0 ? sqlParts.join(' AND ') : '1=1',
    replacements
  };
};

// Updated function to be called from getStudentshelper
export const getOptimizedOverallStatsFromHelper = async (whereConditions, remarkIncludeWhere, utmIncludeWhere) => {
  return await getOptimizedOverallStats({
    whereConditions,
    remarkIncludeWhere,
    utmIncludeWhere,
  });
};