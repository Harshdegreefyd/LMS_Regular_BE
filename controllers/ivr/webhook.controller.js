import axios from 'axios';
import IvrCall from '../../models/ads/Ivr.js';
import { processStudentLead } from '../../helper/leadAssignmentService.js';
export const handleWebhook = async (req, res) => {
    const queryParams = req.query;

    try {
        let {
            SourceNumber,
            DestinationNumber,
            DialWhomNumber,
            CallDuration,
            Status,
            StartTime,
            EndTime,
            CallSid,
            CallRecordingUrl,
            TalkDuration,
        } = queryParams;

        if (SourceNumber && SourceNumber.startsWith('0')) {
            SourceNumber = SourceNumber.substring(1);
        }
        
        const transformedData = {
            name: 'N/A',
            email: `${SourceNumber}@gmail.com`,
            phone_number: SourceNumber,
            source: 'IVR',
            utm_campaign: DestinationNumber,
            first_source_url: DestinationNumber,
            DestinationNumber,
            DialWhomNumber,
            CallDuration,
            Status,
            StartTime,
            EndTime,
            CallSid,
            CallRecordingUrl,
            TalkDuration,
        };
         const IvrResponse=await IvrCall.create({
             email:transformedData.email,
             phone_number:transformedData?.phone_number,
             first_source_url: transformedData?.first_source_url,
              destination_number: transformedData?.DestinationNumber,
              dial_whom_number:transformedData?.DialWhomNumber,
              call_duration:transformedData?.CallDuration,
              status: transformedData?.Status,
              start_time: transformedData?.StartTime,
              end_time:transformedData?.EndTime,
              call_sid:transformedData?.CallSid,
              call_recording_url: transformedData?.CallRecordingUrl,
              talk_duration:transformedData?.TalkDuration,
         })
        const response = await processStudentLead(transformedData)

        res.status(200).json({
            message: 'Webhook received and transformed successfully',
            apiResponse: response.data,
        });
    } catch (error) {
        console.error('❌ Error in webhook processing:', error.message);
        res.status(500).json({
            message: 'Webhook processing failed',
            error: error.message,
        });
    }
};
