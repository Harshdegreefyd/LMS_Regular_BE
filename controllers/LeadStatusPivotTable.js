import React from 'react';

const LeadStatusPivotTable = ({ data }) => {
  // Extract unique colleges for columns
  const colleges = [...new Set(data.map(d => d.college_name))];
  // Extract unique counsellors for rows
  const counsellors = [...new Set(data.map(d => d.counsellor))];

  // Prepare pivoted data
  const tableData = counsellors.map(counsellorName => {
    const row = { counsellor: counsellorName };
    colleges.forEach(college => {
      const record = data.find(r => r.counsellor === counsellorName && r.college_name === college);
      if (record) {
        row[college] = (
          <>
            <span style={{ color: 'red' }}>{record['Do Not Proceed']}</span> 
            <span style={{ color: 'orange' }}>{record['Technical Fail']}</span> 
            <span style={{ color: 'green' }}>{record['Proceed']}</span>
          </>
        );
      } else {
        row[college] = '0';
      }
    });
    return row;
  });

  return (
    <div className="overflow-auto">
      <table className="min-w-full border-collapse border border-gray-300 text-sm">
        <thead>
          <tr>
            <th className="border border-gray-300 p-2 sticky left-0 bg-white z-10">Counsellor</th>
            {colleges.map(college => (
              <th key={college} className="border border-gray-300 p-2 text-center">{college}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.map((row, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              <td className="border border-gray-300 p-2 sticky left-0 bg-white font-semibold">{row.counsellor}</td>
              {colleges.map(college => (
                <td key={college} className="border border-gray-300 p-2 text-center">{row[college]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LeadStatusPivotTable;
