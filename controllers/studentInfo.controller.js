import StudentCollegeApiSentStatus from "../models/CollegeAPISentStatus.js";
import StudentInfoCollection from "../models/studentsInfoCollection.js";

export const upsertStudentInfo = async (req, res) => {
    try {
        const { student_id, student_info } = req.body;

        if (!student_id) {
            return res.status(400).json({ message: "student_id is required" });
        }

        let record = await StudentInfoCollection.findOne({ where: { student_id } });

        if (record) {
            record.student_info = student_info;
            await record.save();
            return res.json({ message: "Student info updated", data: record });
        }

        const newRecord = await StudentInfoCollection.create({
            student_id,
            student_info
        });

        res.json({ message: "Student info saved", data: newRecord });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const addSecondaryDetails = async (req, res) => {
    try {
        const { student_id } = req.params;
        const { secondary_details } = req.body;

        if (!student_id) {
            return res.status(400).json({ message: "student_id is required" });
        }

        if (!secondary_details || !Array.isArray(secondary_details)) {
            return res.status(400).json({ message: "secondary_details array is required" });
        }

        let record = await StudentInfoCollection.findOne({ where: { student_id } });

        if (!record) {
            record = await StudentInfoCollection.create({
                student_id,
                student_info: { secondary_details: [] }
            });
        }

        const existingInfo = record.student_info || {};
        const existingSecondaryDetails = existingInfo.secondary_details || [];

        const emailSet = new Set(existingSecondaryDetails.map(d => d.email));
        const newDetails = secondary_details.filter(detail => !emailSet.has(detail.email));

        const updatedSecondaryDetails = [...existingSecondaryDetails, ...newDetails];

        record.student_info = {
            ...existingInfo,
            secondary_details: updatedSecondaryDetails
        };

        await record.save();

        res.json({
            message: "Secondary details added successfully",
            data: record,
            addedCount: newDetails.length
        });

    } catch (error) {
        console.error("Error adding secondary details:", error);
        res.status(500).json({ message: error.message });
    }
};

export const getStudentInfo = async (req, res) => {
    try {
        const { student_id } = req.params;
        const { include_statuses } = req.query; 

        const record = await StudentInfoCollection.findOne({
            where: { student_id }
        });

        if (!record) {
            return res.status(404).json({ 
                message: "No data found",
                data: { 
                    student_info: { 
                        secondary_details: [],
                        status_summary: {}
                    } 
                }
            });
        }

        let secondaryDetails = record.student_info?.secondary_details || [];

        // ALWAYS include statuses for secondary contacts
        const detailsWithStatus = await Promise.all(
            secondaryDetails.map(async (contact) => {
                // Get all statuses for this secondary contact
                const statuses = await StudentCollegeApiSentStatus.findAll({
                    where: {
                        student_id,
                        student_email: contact.email,
                        isPrimary: false
                    },
                    attributes: ['college_name', 'api_sent_status', 'created_at', 'response_from_api'],
                    order: [['created_at', 'DESC']]
                });

                // Group by university
                const statusByUniversity = {};
                statuses.forEach(status => {
                    if (!statusByUniversity[status.college_name]) {
                        statusByUniversity[status.college_name] = {
                            last_status: status.api_sent_status,
                            last_sent_at: status.created_at,
                            response_data: status.response_from_api,
                            sent_count: 0
                        };
                    }
                    statusByUniversity[status.college_name].sent_count++;
                });

                // Get universities where this contact has been sent
                const sentUniversities = statuses.map(s => s.college_name);
                const uniqueSentUniversities = [...new Set(sentUniversities)];

                return {
                    ...contact,
                    status_by_university: statusByUniversity,
                    sent_to_universities: uniqueSentUniversities,
                    total_sent_count: statuses.length,
                    latest_status: statuses[0]?.api_sent_status || 'Not Sent',
                    last_sent_at: statuses[0]?.created_at || null
                };
            })
        );

        // Calculate overall status summary
        const statusSummary = {
            total_secondary_contacts: detailsWithStatus.length,
            total_sent_attempts: detailsWithStatus.reduce((sum, contact) => sum + contact.total_sent_count, 0),
            by_status: detailsWithStatus.reduce((acc, contact) => {
                Object.values(contact.status_by_university).forEach(univStatus => {
                    const status = univStatus.last_status || 'Unknown';
                    acc[status] = (acc[status] || 0) + 1;
                });
                return acc;
            }, {})
        };

        // Also get primary statuses for comparison
        const primaryStatuses = await StudentCollegeApiSentStatus.findAll({
            where: {
                student_id,
                isPrimary: true
            },
            attributes: ['college_name', 'api_sent_status', 'created_at'],
            order: [['created_at', 'DESC']]
        });

        // Group primary statuses by university (latest only)
        const primaryStatusByUniversity = {};
        primaryStatuses.forEach(status => {
            if (!primaryStatusByUniversity[status.college_name] || 
                new Date(status.created_at) > new Date(primaryStatusByUniversity[status.college_name].created_at)) {
                primaryStatusByUniversity[status.college_name] = {
                    status: status.api_sent_status,
                    created_at: status.created_at
                };
            }
        });

        const responseData = {
            ...record.toJSON(),
            student_info: {
                ...record.student_info,
                secondary_details: detailsWithStatus,
                status_summary: statusSummary,
                primary_statuses: primaryStatusByUniversity
            }
        };

        res.json({ message: "Success", data: responseData });

    } catch (error) {
        console.error("Error fetching student info:", error);
        res.status(500).json({ message: error.message });
    }
};

export const getStudentSecondaryContactsWithStatus = async (req, res) => {
    try {
        const { student_id } = req.params;
        const { university_name } = req.query; 

        const studentInfoRecord = await StudentInfoCollection.findOne({
            where: { student_id }
        });

        let secondaryContacts = [];
        
        if (studentInfoRecord && studentInfoRecord.student_info?.secondary_details) {
            secondaryContacts = studentInfoRecord.student_info.secondary_details;
        }

        const enrichedContacts = await Promise.all(
            secondaryContacts.map(async (contact) => {
                const statusEntries = await StudentCollegeApiSentStatus.findAll({
                    where: {
                        student_id,
                        student_email: contact.email,
                        isPrimary: false 
                    },
                    order: [['created_at', 'DESC']] 
                });

                const statusesByUniversity = {};
                statusEntries.forEach(entry => {
                    if (!statusesByUniversity[entry.college_name]) {
                        statusesByUniversity[entry.college_name] = [];
                    }
                    statusesByUniversity[entry.college_name].push({
                        status: entry.api_sent_status,
                        response_data: entry.response_from_api,
                        sent_at: entry.created_at,
                        updated_at: entry.updated_at,
                        request_data: entry.request_to_api,
                        sent_type: entry.sent_type
                    });
                });

                const universityStatuses = Object.entries(statusesByUniversity).map(([university, statuses]) => {
                    const latestStatus = statuses[0]; 
                    return {
                        university_name: university,
                        status: latestStatus.status,
                        last_sent_at: latestStatus.sent_at,
                        response_data: latestStatus.response_data,
                        sent_count: statuses.length 
                    };
                });

                return {
                    ...contact,
                    statuses: universityStatuses,
                    sent_to_universities: contact.sent_to_universities || []
                };
            })
        );

        let filteredContacts = enrichedContacts;
        if (university_name) {
            filteredContacts = enrichedContacts.filter(contact => 
                contact.sent_to_universities?.includes(university_name) ||
                contact.statuses?.some(status => status.university_name === university_name)
            );
        }

        res.json({
            message: "Success",
            data: {
                student_id,
                contacts: filteredContacts,
                total_contacts: filteredContacts.length
            }
        });

    } catch (error) {
        console.error("Error fetching secondary contacts with status:", error);
        res.status(500).json({ message: error.message });
    }
};

export const getContactStatusForUniversity = async (req, res) => {
    try {
        const { student_id, university_name } = req.params;

        const statuses = await StudentCollegeApiSentStatus.findAll({
            where: {
                student_id,
                college_name: university_name,
                isPrimary: false
            },
            order: [['created_at', 'DESC']]
        });

        const contactsByEmail = {};
        statuses.forEach(status => {
            if (!contactsByEmail[status.student_email]) {
                contactsByEmail[status.student_email] = {
                    email: status.student_email,
                    phone: status.student_phone,
                    statuses: [],
                    isPrimary: status.isPrimary
                };
            }
            contactsByEmail[status.student_email].statuses.push({
                status: status.api_sent_status,
                response_data: status.response_from_api,
                sent_at: status.created_at,
                request_data: status.request_to_api,
                sent_type: status.sent_type
            });
        });

        const contacts = Object.values(contactsByEmail).map(contact => ({
            ...contact,
            latest_status: contact.statuses[0]?.status,
            last_sent_at: contact.statuses[0]?.sent_at,
            attempts_count: contact.statuses.length
        }));

        res.json({
            message: "Success",
            data: {
                university_name,
                student_id,
                contacts,
                total_contacts: contacts.length,
                summary: {
                    sent_attempts: statuses.length,
                    unique_contacts: contacts.length,
                    by_status: contacts.reduce((acc, contact) => {
                        const status = contact.latest_status || 'Unknown';
                        acc[status] = (acc[status] || 0) + 1;
                        return acc;
                    }, {})
                }
            }
        });

    } catch (error) {
        console.error("Error fetching contact status:", error);
        res.status(500).json({ message: error.message });
    }
};

