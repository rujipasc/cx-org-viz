function EmployeeDetailsModal({ selectedEmployee, onClose, formatDate, getEmployeeInitials }) {
  if (!selectedEmployee) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content text-left" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Employee Details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className={`export-modal-avatar w-16 h-16 rounded-lg grid place-items-center text-white font-semibold text-lg leading-none ${selectedEmployee.isVacant ? "bg-amber-500" : "bg-blue-600"}`}>
              <span className="export-avatar-text">{getEmployeeInitials(selectedEmployee.name, selectedEmployee.isVacant)}</span>
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-900">
                {selectedEmployee.isVacant ? "Vacant" : (selectedEmployee.name || "-")}{" "}
                <span className="text-sm font-normal text-slate-500">
                  ({selectedEmployee.employeeId || (selectedEmployee.isVacant ? "Vacant Slot" : selectedEmployee.id)})
                </span>
              </h3>
              <p className="text-sm text-slate-600">{selectedEmployee.position}</p>
            </div>
          </div>
          <div className="border-t border-slate-200"></div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-50 p-3 rounded"><span className="text-xs text-slate-500 uppercase font-bold block">Group</span>{selectedEmployee.groupName || "-"}</div>
            <div className="bg-slate-50 p-3 rounded"><span className="text-xs text-slate-500 uppercase font-bold block">Org Name</span>{selectedEmployee.orgName || "-"}</div>
            <div className="bg-slate-50 p-3 rounded"><span className="text-xs text-slate-500 uppercase font-bold block">Email</span>{selectedEmployee.email || "-"}</div>
            <div className="bg-slate-50 p-3 rounded"><span className="text-xs text-slate-500 uppercase font-bold block">Phone</span>{selectedEmployee.phone}</div>
            <div className="bg-slate-50 p-3 rounded"><span className="text-xs text-slate-500 uppercase font-bold block">Hire Date</span>{formatDate(selectedEmployee.hireDate)}</div>
            <div className="bg-slate-50 p-3 rounded"><span className="text-xs text-slate-500 uppercase font-bold block">Supervisor</span>{selectedEmployee.manager_id ? `ID: ${selectedEmployee.manager_id}` : "None"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmployeeDetailsModal;
