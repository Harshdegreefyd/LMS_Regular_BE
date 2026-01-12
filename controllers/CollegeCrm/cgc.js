import axios from 'axios';

export async function sendLeadToCgcCRM(reqdata) {
  try {
    const response = await axios.post(
      'https://api.nopaperforms.com/dataporting/270/nuvora',
      reqdata,
      {
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
    return response.data;
  } catch (error) {
    return error.response ? error.response.data?.error : error.message;
  }
}
