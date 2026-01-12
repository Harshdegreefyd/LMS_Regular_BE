import sendMail from '../config/SendLmsEmail.js';
import {CourseStatusHistory,Student,Counsellor,LeadAssignmentRuleL3} from '../models/index.js';

import { Op } from 'sequelize';

const DUMMY_AGENT_ID = "CNS-A322569E";
const DUMMY_AGENT_NAME = "DummyDegreeFyd";

const processArrayField = (field) => {
    if (!field) return [];
    if (Array.isArray(field)) {
        return field.filter(item => item && item.trim()).map(item => item.trim());
    }
    return field.trim() ? [field.trim()] : [];
};

const validateL3Agents = async (assignedAgents) => {
    const agents = await Counsellor.findAll({
        where: {
            counsellor_id: { [Op.in]: assignedAgents },
            role: 'l3'
        }
    });
    return agents.length === assignedAgents.length;
};

const sendAssignmentEmail = async (studentId,data) => {
    try {
        const student = await Student.findByPk(studentId, {
            include: [{
                model: Counsellor,
                as: 'assignedCounsellorL3',
                attributes: ['counsellor_name', 'counsellor_email']
            }]
        });

        if (!student) return;

        const courses = await CourseStatusHistory.findOne({ 
            where: { student_id: student.student_id } 
        });
        console.log('data',data)
        const emailData = {
            id: student.student_id,
            name: student.student_name,
            email: student.student_email,
            phone: student.student_phone,
            timestamp: new Date(),
            asigned_college: data?.collegeName || 'N/A', 
            asigned_course: data?.Course || 'N/A',
            agent_name: student.assignedCounsellorL3?.counsellor_name,
            agent_email: student.assignedCounsellorL3?.counsellor_email
        };
        const recipients = [
            'Bhuwan@degreefyd.com',
            'Sid@degreefyd.com',
            'Deepak@degreefyd.com',
            'Guruvinder.singh@degreefyd.com',
             student.assignedCounsellorL3?.counsellor_email,
            
        ].filter(Boolean);

        await sendMail(emailData, recipients);
    } catch (error) {
        console.error('Error sending assignment email:', error);
    }
};

// Controller Functions
export const getRuleSets = async (req, res) => {
    try {
        const ruleSets = await LeadAssignmentRuleL3.findAll({
            order: [
                ['priority', 'DESC'],
                ['created_at', 'DESC']
            ]
        });

        // Manually fetch counsellor details for each ruleset
        const ruleSetsWithCounsellors = await Promise.all(
            ruleSets.map(async (ruleSet) => {
                const counsellorDetails = await Counsellor.findAll({
                    where: {
                        counsellor_id: { [Op.in]: ruleSet.assigned_counsellor_ids }
                    },
                    attributes: ['counsellor_name', 'counsellor_email', 'role', 'counsellor_id']
                });

                return {
                    ...ruleSet.toJSON(),
                    assignedCounsellorDetails: counsellorDetails
                };
            })
        );

        res.status(200).json(ruleSetsWithCounsellors);
    } catch (error) {
        console.error('Error fetching rulesets:', error.message);
        res.status(500).json({
            message: 'Error fetching rulesets',
            error: error.message
        });
    }
};

export const getRuleSetById = async (req, res) => {
    try {
        const { id } = req.params;
        const ruleSet = await LeadAssignmentRuleL3.findByPk(id);

        if (!ruleSet) {
            return res.status(404).json({ message: 'RuleSet not found' });
        }

        res.status(200).json(ruleSet);
    } catch (error) {
        console.error('Error fetching ruleset:', error);
        res.status(500).json({
            message: 'Error fetching ruleset',
            error: error.message
        });
    }
};

export const createRuleSet = async (req, res) => {
    try {
        const {
            college,
            universityName,
            course,
            source,
            assignedCounsellor,
            isActive,
            priority,
            custom_rule_name
        } = req.body;

        // Validate required fields
        if (!assignedCounsellor || assignedCounsellor.length === 0) {
            return res.status(400).json({
                message: 'At least one assigned counsellor is required'
            });
        }

        // Verify all assigned counsellors exist and are L3 counsellors
        const isValidAgents = await validateL3Agents(assignedCounsellor);
        if (!isValidAgents) {
            return res.status(400).json({
                message: 'One or more assigned counsellors are invalid or not L3 counsellors'
            });
        }

        // Generate unique rule name
        const ruleName = await LeadAssignmentRuleL3.generateRuleName();

        // Create new ruleset
        const newRuleSet = await LeadAssignmentRuleL3.create({
            name: ruleName,
            college: college?.trim() || '',
            university_name: processArrayField(universityName),
            course_conditions: {
                stream: processArrayField(course?.stream),
                degree: processArrayField(course?.degree),
                specialization: processArrayField(course?.specialization),
                level: processArrayField(course?.level),
                courseName: processArrayField(course?.courseName)
            },
            source: processArrayField(source),
            assigned_counsellor_ids: assignedCounsellor,
            is_active: isActive !== undefined ? isActive : true,
            priority: priority || 0,
            round_robin_index: 0,
            custom_rule_name: custom_rule_name || ''
        });

        // Fetch counsellor details
        const counsellorDetails = await Counsellor.findAll({
            where: {
                counsellor_id: { [Op.in]: newRuleSet.assigned_counsellor_ids }
            },
            attributes: ['counsellor_name', 'counsellor_email', 'role', 'counsellor_id']
        });

        // Add counsellor details to response
        const ruleSetWithCounsellors = {
            ...newRuleSet.toJSON(),
            assignedCounsellorDetails: counsellorDetails
        };

        res.status(201).json({
            message: 'RuleSet created successfully',
            ruleSet: ruleSetWithCounsellors
        });
    } catch (error) {
        console.error('Error creating ruleset:', error);
        res.status(500).json({
            message: 'Error creating ruleset',
            error: error.message
        });
    }
};

export const updateRuleSet = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
      console.log('Update Data:', updateData);
        // If assignedCounsellor are being updated, verify they exist and are L3
        if (updateData.assignedCounsellor) {
            const isValidAgents = await validateL3Agents(updateData.assignedCounsellor);
            if (!isValidAgents) {
                return res.status(400).json({
                    message: 'One or more assigned counsellors are invalid or not L3 counsellors'
                });
            }
            if(updateData?.custom_rule_name) updateData.custom_rule_name = updateData.custom_rule_name;
            updateData.assigned_counsellor_ids = updateData.assignedCounsellor;
            delete updateData.assignedCounsellor;
        }

        const [updatedRowsCount] = await LeadAssignmentRuleL3.update(
            { ...updateData, updated_at: new Date() },
            { where: { l3_assignment_rulesets_id: id } }
        );

        if (updatedRowsCount === 0) {
            return res.status(404).json({
                message: 'RuleSet not found'
            });
        }

        const updatedRuleSet = await LeadAssignmentRuleL3.findByPk(id);

        res.status(200).json({
            message: 'RuleSet updated successfully',
            ruleSet: updatedRuleSet
        });
    } catch (error) {
        console.error('Error updating ruleset:', error);
        res.status(500).json({
            message: 'Error updating ruleset',
            error: error.message
        });
    }
};

export const deleteRuleSet = async (req, res) => {
    try {
        const { id } = req.params;

        const ruleSet = await LeadAssignmentRuleL3.findByPk(id);
        if (!ruleSet) {
            return res.status(404).json({
                message: 'RuleSet not found'
            });
        }

        await LeadAssignmentRuleL3.destroy({
            where: { l3_assignment_rulesets_id: id }
        });

        res.status(200).json({
            message: 'RuleSet deleted successfully',
            ruleSet: ruleSet
        });
    } catch (error) {
        console.error('Error deleting ruleset:', error);
        res.status(500).json({
            message: 'Error deleting ruleset',
            error: error.message
        });
    }
};

export const toggleRuleSetStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const ruleSet = await LeadAssignmentRuleL3.findByPk(id);
        if (!ruleSet) {
            return res.status(404).json({
                message: 'RuleSet not found'
            });
        }

        await ruleSet.update({
            is_active: !ruleSet.is_active
        });

        res.status(200).json({
            message: `RuleSet ${ruleSet.is_active ? 'activated' : 'deactivated'} successfully`,
            ruleSet: ruleSet
        });
    } catch (error) {
        console.error('Error toggling ruleset status:', error);
        res.status(500).json({
            message: 'Error toggling ruleset status',
            error: error.message
        });
    }
};

export const assignedtoL3byruleSet = async (req, res) => {
   
    try {
        const {
            studentId,
            collegeName,
            Course,
            Degree,
            Specialization,
            level,
            source,
            stream
        } = req.body;

        console.log(req.body,'req.body')
        if (!studentId) {
            return res.status(400).json({ message: "studentId is required" });
        }

        // Check if student already has L3 counsellor assigned
        const studentDetails = await Student.findByPk(studentId);
        if (studentDetails?.assigned_counsellor_l3_id) {
            const counsellor = await Counsellor.findOne({
                where: { counsellor_id: studentDetails.assigned_counsellor_l3_id }
            });
            
            return res.status(200).json({
                message: "Student already has L3 counsellor assigned",
                assigned_counsellor: studentDetails.assigned_counsellor_l3_id,
                counsellor_name: ''
            });
        }

        // Find all active rulesets
        const allRulesets = await LeadAssignmentRuleL3.findAll({ 
            where: { is_active: true } 
        });
        if (!allRulesets || allRulesets.length === 0) {
            return res.status(404).json({ message: "No active ruleset found" });
        }

        // Filter by mandatory conditions (collegeName and source)
        const filteredRulesets = allRulesets.filter(ruleset => {
            // University Name Match
            const universityMatch = !collegeName || !ruleset.university_name?.length ||
                ruleset.university_name.some(uni =>
                    uni.toLowerCase().trim() === collegeName.toLowerCase().trim()
                );

            // Source Match
            const sourceMatch = !source || !ruleset.source?.length ||
                ruleset.source.includes(source);
            console.log('universityMatch',collegeName,universityMatch,sourceMatch)
            return universityMatch && sourceMatch;
        });
        if (filteredRulesets.length === 0) {
            // Assign dummy counsellor when no ruleset matches
            const updateData = {
                assigned_counsellor_l3_id: DUMMY_AGENT_ID,
                assigned_l3_date: new Date(),
            };
            console.log('updateData',updateData)
            await Student.update(updateData, { 
                where: { student_id: studentId } 
            });
            
            sendAssignmentEmail(studentId,{ collegeName,
            Course});

            return res.status(200).json({
                message: "No matching ruleset found, assigned dummy L3 counsellor",
                student_id: studentId,
                assigned_counsellor_l3: DUMMY_AGENT_ID,
                counsellor_name_l3: DUMMY_AGENT_NAME,
                assignment_method: "dummy_fallback",
                reason: "No ruleset found matching collegeName and source criteria"
            });
        }

        // Define hierarchy checks for course matching
        const hierarchyChecks = [
            {
                name: 'courseName',
                check: (ruleset) => {
                    if (!Course || !ruleset.course_conditions?.courseName?.length) return false;
                    return ruleset.course_conditions.courseName.some(courseName =>
                        courseName.toLowerCase().includes(Course.toLowerCase()) ||
                        Course.toLowerCase().includes(courseName.toLowerCase())
                    );
                }
            },
            {
                name: 'degree',
                check: (ruleset) => {
                    if (!Degree || !ruleset.course_conditions?.degree?.length) return false;
                    return ruleset.course_conditions.degree.includes(Degree);
                }
            },
            {
                name: 'specialization',
                check: (ruleset) => {
                    if (!Specialization || !ruleset.course_conditions?.specialization?.length) return false;
                    return ruleset.course_conditions.specialization.some(spec =>
                        spec.toLowerCase().includes(Specialization.toLowerCase()) ||
                        Specialization.toLowerCase().includes(spec.toLowerCase())
                    );
                }
            },
            {
                name: 'stream',
                check: (ruleset) => {
                    if (!stream || !ruleset.course_conditions?.stream?.length) return false;
                    return ruleset.course_conditions.stream.some(s =>
                        s.toLowerCase().includes(stream.toLowerCase()) ||
                        stream.toLowerCase().includes(s.toLowerCase())
                    );
                }
            },
            {
                name: 'level',
                check: (ruleset) => {
                    if (!level || !ruleset.course_conditions?.level?.length) return false;
                    return ruleset.course_conditions.level.includes(level);
                }
            }
        ];

        // Check if any course field matches
        const hasAnyCourseMatch = filteredRulesets.some(ruleset =>
            hierarchyChecks.some(hierarchyLevel => hierarchyLevel.check(ruleset))
        );

        let selectedRuleset = null;
        let matchedAt = null;
        let currentFilteredRulesets = [...filteredRulesets];

        if (hasAnyCourseMatch) {
            // Use hierarchy logic for course matching
            for (const hierarchyLevel of hierarchyChecks) {
                const matchingRulesets = currentFilteredRulesets.filter(ruleset =>
                    hierarchyLevel.check(ruleset)
                );

                if (matchingRulesets.length > 0) {
                    if (matchingRulesets.length === 1) {
                        selectedRuleset = matchingRulesets[0];
                        matchedAt = hierarchyLevel.name;
                        break;
                    } else {
                        currentFilteredRulesets = matchingRulesets;
                    }
                }
            }

            // If multiple rulesets remain, select based on priority
            if (!selectedRuleset && currentFilteredRulesets.length > 0) {
                currentFilteredRulesets.sort((a, b) => (b.priority || 0) - (a.priority || 0));
                selectedRuleset = currentFilteredRulesets[0];
                matchedAt = 'priority-based';
            }
        } else {
            // No course fields match, assign from college-matched ruleset
            filteredRulesets.sort((a, b) => (b.priority || 0) - (a.priority || 0));
            selectedRuleset = filteredRulesets[0];
            matchedAt = 'college-name-only';
        }

        if (!selectedRuleset) {
            return res.status(404).json({ message: "No matching ruleset found for the given criteria" });
        }

        // Get assigned counsellors from the selected ruleset
        const assignedCounsellors = selectedRuleset.assigned_counsellor_ids;
        if (!assignedCounsellors || assignedCounsellors.length === 0) {
            return res.status(404).json({ message: "No counsellors assigned to the selected ruleset" });
        }

        let selectedCounsellorId;
        let assignmentMethod;
        let currentRoundRobinIndex = 0;

        if (assignedCounsellors.length === 1) {
            selectedCounsellorId = assignedCounsellors[0];
            assignmentMethod = "direct";
        } else {
            // Use round-robin assignment
            currentRoundRobinIndex = selectedRuleset.round_robin_index || 0;

            if (currentRoundRobinIndex >= assignedCounsellors.length) {
                currentRoundRobinIndex = 0;
            }

            selectedCounsellorId = assignedCounsellors[currentRoundRobinIndex];
            assignmentMethod = "round-robin";

            // Update round-robin index
            const nextIndex = (currentRoundRobinIndex + 1) % assignedCounsellors.length;
            await LeadAssignmentRuleL3.update(
                { round_robin_index: nextIndex },
                { where: { l3_assignment_rulesets_id: selectedRuleset.l3_assignment_rulesets_id } }
            );
        }

        // Find counsellor details using counsellor_id
        let counsellorDetails = await Counsellor.findOne({
            where: { counsellor_id: selectedCounsellorId }
        });

        if (!counsellorDetails) {
            return res.status(404).json({ message: "Selected counsellor not found" });
        }

        // Update student with assignment
        const updateData = {

            assigned_counsellor_l3_id: counsellorDetails.counsellor_id,
            assigned_l3_date: new Date(),
        };
        console.log(updateData,'updated_data')
        await Student.update(updateData, { 
            where: { student_id: studentId } 
        });

        const responseMessage = hasAnyCourseMatch
            ? "L3 counsellor assigned successfully"
            : "L3 counsellor assigned based on college name match (no course criteria matched)";

        sendAssignmentEmail(studentId,{ collegeName,
            Course});

        res.status(200).json({
            message: responseMessage,
            student_id: studentId,
            assigned_counsellor_l3: counsellorDetails.counsellor_id,
            counsellor_name_l3: counsellorDetails.counsellor_name,
            assignment_method: assignmentMethod,
            course_fields_matched: hasAnyCourseMatch,
            matched_ruleset: {
                id: selectedRuleset.l3_assignment_rulesets_id,
                name: selectedRuleset.name,
                matched_at_level: matchedAt,
                priority: selectedRuleset.priority || 0
            },
            round_robin_info: assignmentMethod === "round-robin" ? {
                used_index: currentRoundRobinIndex,
                total_counsellors: assignedCounsellors.length,
                next_index: (currentRoundRobinIndex + 1) % assignedCounsellors.length
            } : null
        });

    } catch (error) {
        console.error('Error in L3 assignment:', error.message);
        res.status(500).json({
            message: "Error in assigning L3 counsellor",
            error: error.message
        });
    }
};