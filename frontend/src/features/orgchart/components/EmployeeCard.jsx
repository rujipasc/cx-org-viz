function EmployeeCard({
  employee,
  level = 0,
  useWrappedLayout = false,
  expandedNodes,
  isPanning,
  onSelectEmployee,
  onToggleNode,
  formatDate,
  getEmployeeInitials,
  getOrgBadgeColor,
  chunkArray
}) {
  const hasSubordinates = employee.subordinates && employee.subordinates.length > 0;
  const isExpanded = expandedNodes.has(employee.id);
  const badgeClass = getOrgBadgeColor(employee.orgType);
  const isVacant = !!employee.isVacant;
  const avatarText = getEmployeeInitials(employee.name, isVacant);
  const cardWidthClass = useWrappedLayout ? "w-80" : "w-72";
  const wrappedRows = useWrappedLayout ? chunkArray(employee.subordinates || [], 4) : [];
  const cardClass = isVacant
    ? "border-amber-300 bg-amber-50/40 shadow-sm"
    : level === 0
      ? "border-blue-600 shadow-md"
      : "border-slate-200 hover:border-slate-300 hover:shadow-md";
  const avatarClass = isVacant ? "bg-amber-500" : level === 0 ? "bg-blue-600" : "bg-slate-600";
  const displayName = isVacant ? "Vacant" : employee.name || "-";

  return (
    <div className="org-node" data-org-node-id={employee.id}>
      <div
        className={`
          bg-white rounded-lg shadow-sm border-2 transition-all duration-200 relative z-20
          cursor-pointer group ${cardWidthClass} animate-in
          ${cardClass}
        `}
        onClick={() => !isPanning && onSelectEmployee(employee)}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={`export-avatar w-10 h-10 rounded-lg grid place-items-center font-semibold text-white text-xs leading-none flex-shrink-0 ${avatarClass}`}>
              <span className="export-avatar-text">{avatarText}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm leading-tight break-words">{displayName}</h3>
              <p className="text-xs text-slate-600 mt-0.5 leading-tight break-words whitespace-normal">{employee.position}</p>
              {isVacant && (
                <span className="inline-flex mt-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide">
                  Vacant
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className={`export-org-badge inline-grid place-items-center h-5 px-2 rounded text-[9px] leading-none font-bold border uppercase tracking-wider ${badgeClass}`}>
                <span className="export-org-badge-text">{employee.orgType || "N/A"}</span>
              </span>
              <span className="text-[10px] text-slate-400">{formatDate(employee.hireDate)}</span>
            </div>
            <div className="flex flex-col">
              {employee.groupName && employee.groupName !== employee.orgName && (
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide whitespace-normal break-words">{employee.groupName}</span>
              )}
              <span className="text-xs font-medium text-slate-700 whitespace-normal break-words" title={employee.orgName}>{employee.orgName}</span>
            </div>
          </div>
          {hasSubordinates && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleNode(employee.id);
              }}
              className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              {employee.subordinates.length} reports
              <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          )}
        </div>
      </div>
      {hasSubordinates && isExpanded && (
        useWrappedLayout ? (
          <>
            <div className="w-[2px] h-6 bg-slate-300"></div>
            <div className="flex flex-col items-center gap-4">
              {wrappedRows.map((row, rowIndex) => (
                <div key={`${employee.id}-row-${rowIndex}`} className="org-level">
                  {row.map((sub, idx) => (
                    <div key={sub.id} className="relative flex flex-col items-center org-level-item-wrap">
                      {idx > 0 && <div className="absolute top-0 right-1/2 w-[calc(50%+0.625rem)] h-[2px] bg-slate-300"></div>}
                      {idx < row.length - 1 && <div className="absolute top-0 left-1/2 w-[calc(50%+0.625rem)] h-[2px] bg-slate-300"></div>}
                      <div className="w-[2px] h-6 bg-slate-300"></div>
                      <EmployeeCard
                        employee={sub}
                        level={level + 1}
                        useWrappedLayout={useWrappedLayout}
                        expandedNodes={expandedNodes}
                        isPanning={isPanning}
                        onSelectEmployee={onSelectEmployee}
                        onToggleNode={onToggleNode}
                        formatDate={formatDate}
                        getEmployeeInitials={getEmployeeInitials}
                        getOrgBadgeColor={getOrgBadgeColor}
                        chunkArray={chunkArray}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="w-[2px] h-6 bg-slate-300"></div>
            <div className="org-level">
              {employee.subordinates.map((sub, idx) => (
                <div key={sub.id} className="relative flex flex-col items-center">
                  {idx > 0 && <div className="absolute top-0 right-1/2 w-[calc(50%+1rem)] h-[2px] bg-slate-300"></div>}
                  {idx < employee.subordinates.length - 1 && <div className="absolute top-0 left-1/2 w-[calc(50%+1rem)] h-[2px] bg-slate-300"></div>}
                  <div className="w-[2px] h-6 bg-slate-300"></div>
                  <EmployeeCard
                    employee={sub}
                    level={level + 1}
                    useWrappedLayout={useWrappedLayout}
                    expandedNodes={expandedNodes}
                    isPanning={isPanning}
                    onSelectEmployee={onSelectEmployee}
                    onToggleNode={onToggleNode}
                    formatDate={formatDate}
                    getEmployeeInitials={getEmployeeInitials}
                    getOrgBadgeColor={getOrgBadgeColor}
                    chunkArray={chunkArray}
                  />
                </div>
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}

export default EmployeeCard;
