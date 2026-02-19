import { useEffect, useMemo, useRef, useState } from "react";
import EmployeeCard from "./components/EmployeeCard";
import EmployeeDetailsModal from "./components/EmployeeDetailsModal";
import useOrgChartExport from "./hooks/useOrgChartExport";
import { HRIS_LOGO_REMOTE, HRIS_LOGO_LOCAL, CARDX_LOGO_REMOTE, CARDX_LOGO_LOCAL, CARDX_LOGO_INLINE } from "./constants/logoSources";

      // Helper: Badge Colors
      const getOrgBadgeColor = (type) => {
        if (!type) return 'bg-slate-100 text-slate-700 border-slate-200';
        const t = type.toLowerCase();
        if (t.includes('group') || t.includes('bu')) return 'bg-purple-100 text-purple-700 border-purple-200';
        if (t.includes('division')) return 'bg-indigo-100 text-indigo-700 border-indigo-200';
        if (t.includes('department')) return 'bg-teal-100 text-teal-700 border-teal-200';
        if (t.includes('unit')) return 'bg-orange-100 text-orange-700 border-orange-200';
        return 'bg-slate-100 text-slate-700 border-slate-200';
      };

      const buildHierarchy = (flatData) => {
        const dataMap = {};
        const roots = [];
        flatData.forEach((row, rowIndex) => {
          // Robust key checking (trimming keys to avoid issues with extra spaces in Excel headers)
          const getVal = (key) => {
             const foundKey = Object.keys(row).find(k => k.trim() === key);
             return foundKey ? row[foundKey] : undefined;
          };

          const rawId = getVal("Employee ID CardX")?.toString().trim();
          const employeeName = (getVal("Name (EN)") || "").toString().trim();
          const employeePosition = (getVal("Position") || "").toString().trim();
          const managerId = getVal("Supervisor ID")?.toString().trim();
          const isVacant = !rawId;
          // Skip malformed rows that can create blank artifacts in export.
          if (!employeeName && !employeePosition) return;

          let id = rawId || `VACANT-${rowIndex + 1}-${managerId || "ROOT"}`;
          if (dataMap[id]) id = `${id}-DUP-${rowIndex + 1}`;

          let orgType = "Company";
          let orgName = getVal("Company") || "CardX";
          
          const unit = getVal("Unit");
          const dept = getVal("Department");
          const div = getVal("Division");
          const group = getVal("Group");
          const positionText = (getVal("Position") || "").toString().trim().toLowerCase();
          const corporateTitleText = (getVal("Corporate Title") || "").toString().trim().toLowerCase();
          const divisionText = (div || "").toString().trim().toLowerCase();
          const isCEO = positionText.includes("chief executive officer") || positionText === "ceo";
          const isChiefLevel = !isCEO && (positionText.includes("chief") || corporateTitleText.includes("chief"));
          const isCPO = positionText.includes("chief people officer") || divisionText.includes("cpo office");

          if (isCEO) { orgType = "Company"; orgName = getVal("Company") || "CardX"; }
          else if (isChiefLevel) {
            orgType = group ? "Group" : (div ? "Division" : (dept ? "Department" : (unit ? "Unit" : "Company")));
            orgName = group || div || dept || unit || getVal("Company") || "CardX";
          }
          else if (unit) { orgType = "Unit"; orgName = unit; }
          else if (dept) { orgType = "Department"; orgName = dept; }
          else if (isCPO && group) { orgType = "Group"; orgName = group; }
          else if (div) { orgType = "Division"; orgName = div; }
          else if (group) { orgType = "Group"; orgName = group; }
          
          dataMap[id] = {
            id: id, 
            employeeId: rawId || "",
            isVacant,
            name: employeeName || "Vacant",
            position: employeePosition || "Vacant Position",
            corporateTitle: (getVal("Corporate Title") || "").toString().trim() || (isVacant ? "Vacant" : "Not Specified"),
            orgType: orgType, 
            orgName: orgName, 
            groupName: group,
            divisionName: div,
            departmentName: dept,
            unitName: unit,
            email: getVal("Office Email") || "-", 
            phone: "-", 
            hireDate: isVacant ? "" : getVal("Service Date"), // Excel might return serial date, CSV returns string
            location: getVal("Location"), 
            manager_id: managerId, 
            subordinates: []
          };
        });

        Object.values(dataMap).forEach(item => {
          const managerId = item.manager_id;
          if (managerId && dataMap[managerId]) {
            dataMap[managerId].subordinates.push(item);
          } else { roots.push(item); }
        });
        const sortTree = (items) => {
          items.sort(compareReportOrder);
          items.forEach((item) => {
            if (item.subordinates?.length) sortTree(item.subordinates);
          });
        };
        sortTree(roots);
        return roots;
      };

      // Helper to format Excel Date Serial (if needed) or String Date
      const formatDate = (dateInput) => {
          if (!dateInput) return "-";
          
          // Handle Excel Serial Date (numbers like 45000)
          if (typeof dateInput === 'number') {
             const excelEpoch = new Date(1899, 11, 30);
             const d = new Date(excelEpoch.getTime() + dateInput * 86400000);
             return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
          }

          const d = new Date(dateInput);
          return isNaN(d.getTime()) ? dateInput : d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
      };

      const getEmployeeInitials = (name, isVacant = false) => {
        if (isVacant) return "VC";
        const initials = (name || "")
          .split(" ")
          .map((n) => n[0] || "")
          .join("")
          .toUpperCase();
        return initials || "NA";
      };

      const flattenTreeNodes = (nodes) => {
        const all = [];
        const walk = (items) => {
          items.forEach((item) => {
            all.push(item);
            if (item.subordinates?.length) walk(item.subordinates);
          });
        };
        walk(nodes || []);
        return all;
      };

      const chunkArray = (items, chunkSize) => {
        const size = Math.max(1, chunkSize || 1);
        const chunks = [];
        for (let i = 0; i < (items || []).length; i += size) {
          chunks.push(items.slice(i, i + size));
        }
        return chunks;
      };

      const normalizeTitleText = (value) => (value || "").toString().trim().toLowerCase();

      const getCorporateTitleRank = (title) => {
        const t = normalizeTitleText(title);
        if (!t) return 99;
        if (t.includes("chief")) return 1;
        if (t.includes("head of")) return 2;
        if (t.includes("team lead")) return 3;
        if (t.includes("expert")) return 4;
        if (t.includes("senior professional")) return 5;
        if (t.includes("professional")) return 6;
        if (t.includes("support")) return 7;
        if (t.includes("staff")) return 8;
        return 99;
      };

      const compareCorporateTitle = (a, b) => {
        const rankDiff = getCorporateTitleRank(a) - getCorporateTitleRank(b);
        if (rankDiff !== 0) return rankDiff;
        return a.localeCompare(b);
      };

      const IS_FILE_ORIGIN = window.location.protocol === "file:";

      const normalizeSearchText = (value) => {
        return (value || "")
          .toString()
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9ก-๙]+/g, " ")
          .trim();
      };

      const buildSearchTokens = (query) => {
        const normalizedQuery = normalizeSearchText(query);
        if (!normalizedQuery) return [];
        return normalizedQuery.split(/\s+/).filter(Boolean);
      };

      const matchesNodeSearch = (node, query) => {
        const tokens = buildSearchTokens(query);
        if (tokens.length === 0) return true;

        const searchBlob = normalizeSearchText([
          node.employeeId || node.id,
          node.name,
          node.position,
          node.corporateTitle,
          node.orgName,
          node.groupName,
          node.divisionName,
          node.departmentName,
          node.unitName
        ].join(" "));

        return tokens.every((token) => searchBlob.includes(token));
      };

      const compareEmployeePriority = (a, b) => {
        const rankDiff = getCorporateTitleRank(a.corporateTitle || "") - getCorporateTitleRank(b.corporateTitle || "");
        if (rankDiff !== 0) return rankDiff;
        const nameA = (a.name || "").toString();
        const nameB = (b.name || "").toString();
        return nameA.localeCompare(nameB);
      };

      const isAssistantRole = (position) => {
        const p = (position || "").toString().trim().toLowerCase();
        return p.includes("assistant") || p.includes("secretary");
      };

      const isCeoRole = (value) => {
        const text = (value || "").toString().trim().toLowerCase();
        return text === "ceo" || text.includes("chief executive officer");
      };

      const isCeoNode = (node) => {
        if (!node) return false;
        return isCeoRole(node.position) || isCeoRole(node.corporateTitle);
      };

      const compareReportOrder = (a, b) => {
        const aAssistant = isAssistantRole(a.position);
        const bAssistant = isAssistantRole(b.position);
        if (aAssistant !== bAssistant) return bAssistant - aAssistant;
        return compareEmployeePriority(a, b);
      };

      const buildEmployeeMap = (items) => {
        const map = {};
        (items || []).forEach((item) => { map[item.id] = item; });
        return map;
      };

      const resolveNearestParentId = (item, parentIds, itemMap) => {
        let cursorId = item?.manager_id;
        const visited = new Set();
        while (cursorId && !visited.has(cursorId)) {
          if (parentIds.has(cursorId)) return cursorId;
          visited.add(cursorId);
          cursorId = itemMap[cursorId]?.manager_id;
        }
        return null;
      };

      const pickHeadsByKey = (items, key, preferredOrgType = "") => {
        const grouped = new Map();
        (items || []).forEach((item) => {
          const bucketKey = (item[key] || "").toString().trim();
          if (!bucketKey) return;
          if (!grouped.has(bucketKey)) grouped.set(bucketKey, []);
          grouped.get(bucketKey).push(item);
        });

        const heads = [];
        grouped.forEach((bucket) => {
          const bucketIds = new Set(bucket.map((item) => item.id));
          const sorted = [...bucket].sort((a, b) => {
            const aOrgMatch = (a.orgType || "").toLowerCase().includes(preferredOrgType);
            const bOrgMatch = (b.orgType || "").toLowerCase().includes(preferredOrgType);
            if (aOrgMatch !== bOrgMatch) return bOrgMatch - aOrgMatch;

            const aManagerInside = !!(a.manager_id && bucketIds.has(a.manager_id));
            const bManagerInside = !!(b.manager_id && bucketIds.has(b.manager_id));
            if (aManagerInside !== bManagerInside) return aManagerInside - bManagerInside;

            return compareEmployeePriority(a, b);
          });
          if (sorted[0]) heads.push(sorted[0]);
        });

        return heads.sort(compareEmployeePriority);
      };

      const toOrgNodeId = (prefix, path) => {
        const safePath = (path || "").toString().trim() || "UNASSIGNED";
        return `ORG-${prefix}-${encodeURIComponent(safePath)}`;
      };

      const createOrgNode = ({
        id,
        label,
        type,
        groupName = "",
        divisionName = "",
        departmentName = "",
        unitName = ""
      }) => ({
        id,
        employeeId: "",
        isVacant: false,
        name: label,
        position: `${type} Node`,
        corporateTitle: `${type} Node`,
        orgType: type,
        orgName: label,
        groupName,
        divisionName,
        departmentName,
        unitName,
        email: "-",
        phone: "-",
        hireDate: "",
        location: "",
        manager_id: "",
        isOrgNode: true,
        subordinates: []
      });

      const buildOrganizationHierarchyTree = (items) => {
        const scoped = [...(items || [])].sort(compareReportOrder);
        if (scoped.length === 0) return [];

        const groupMap = new Map();
        const divisionMap = new Map();
        const departmentMap = new Map();
        const unitMap = new Map();

        const resolveName = (value) => {
          const text = (value || "").toString().trim();
          return text;
        };

        scoped.forEach((employee) => {
          const groupName = resolveName(employee.groupName) || "Unassigned Group";
          const divisionName = resolveName(employee.divisionName);
          const departmentName = resolveName(employee.departmentName);
          const unitName = resolveName(employee.unitName);

          let groupNode = groupMap.get(groupName);
          if (!groupNode) {
            groupNode = createOrgNode({
              id: toOrgNodeId("GROUP", groupName),
              label: groupName,
              type: "Group",
              groupName
            });
            groupMap.set(groupName, groupNode);
          }

          let attachParent = groupNode;

          if (divisionName) {
            const divisionKey = `${groupName}|||${divisionName}`;
            let divisionNode = divisionMap.get(divisionKey);
            if (!divisionNode) {
              divisionNode = createOrgNode({
                id: toOrgNodeId("DIV", divisionKey),
                label: divisionName,
                type: "Division",
                groupName,
                divisionName
              });
              divisionMap.set(divisionKey, divisionNode);
              groupNode.subordinates.push(divisionNode);
            }
            attachParent = divisionNode;
          }

          if (departmentName) {
            const parentDivisionKey = divisionName ? `${groupName}|||${divisionName}` : "__NO_DIVISION__";
            const departmentKey = `${groupName}|||${parentDivisionKey}|||${departmentName}`;
            let departmentNode = departmentMap.get(departmentKey);
            if (!departmentNode) {
              departmentNode = createOrgNode({
                id: toOrgNodeId("DEPT", departmentKey),
                label: departmentName,
                type: "Department",
                groupName,
                divisionName,
                departmentName
              });
              departmentMap.set(departmentKey, departmentNode);
              attachParent.subordinates.push(departmentNode);
            }
            attachParent = departmentNode;
          }

          if (unitName) {
            const parentDivisionKey = divisionName ? `${groupName}|||${divisionName}` : "__NO_DIVISION__";
            const parentDepartmentKey = departmentName
              ? `${groupName}|||${parentDivisionKey}|||${departmentName}`
              : "__NO_DEPARTMENT__";
            const unitKey = `${groupName}|||${parentDepartmentKey}|||${unitName}`;
            let unitNode = unitMap.get(unitKey);
            if (!unitNode) {
              unitNode = createOrgNode({
                id: toOrgNodeId("UNIT", unitKey),
                label: unitName,
                type: "Unit",
                groupName,
                divisionName,
                departmentName,
                unitName
              });
              unitMap.set(unitKey, unitNode);
              attachParent.subordinates.push(unitNode);
            }
            attachParent = unitNode;
          }

          attachParent.subordinates.push({ ...employee, subordinates: [] });
        });

        const sortOrgTree = (nodes) => {
          nodes.sort((a, b) => {
            const aOrg = !!a.isOrgNode;
            const bOrg = !!b.isOrgNode;
            if (aOrg && bOrg) return (a.orgName || a.name || "").localeCompare(b.orgName || b.name || "");
            if (aOrg !== bOrg) return bOrg - aOrg;
            return compareReportOrder(a, b);
          });
          nodes.forEach((node) => {
            if (node.subordinates?.length) sortOrgTree(node.subordinates);
          });
        };

        const normalizeOrgText = (value) => (value || "").toString().trim().toLowerCase();
        const hasRealEmployeeDescendant = (node) => {
          if (!node) return false;
          if (!node.isOrgNode) return true;
          return (node.subordinates || []).some((child) => hasRealEmployeeDescendant(child));
        };

        const pruneRedundantOrgNodes = (nodes) => {
          return (nodes || []).reduce((acc, node) => {
            const cleanedChildren = pruneRedundantOrgNodes(node.subordinates || []);
            let currentNode = { ...node, subordinates: cleanedChildren };

            if (currentNode.isOrgNode) {
              // Collapse same-name chained org nodes (e.g. Group -> Division with identical name).
              while (
                currentNode.subordinates.length === 1
                && currentNode.subordinates[0]?.isOrgNode
                && normalizeOrgText(currentNode.orgName || currentNode.name) === normalizeOrgText(currentNode.subordinates[0].orgName || currentNode.subordinates[0].name)
              ) {
                currentNode = {
                  ...currentNode,
                  subordinates: currentNode.subordinates[0].subordinates || []
                };
              }

              const directPeopleChildren = currentNode.subordinates.filter((child) => !child?.isOrgNode);
              const orgChildren = currentNode.subordinates.filter((child) => !!child?.isOrgNode);
              const hasDirectPeopleOrVacant = directPeopleChildren.length > 0;
              const hasOnlyCompanyLevelPeople = directPeopleChildren.length > 0
                && directPeopleChildren.every((child) => {
                  const orgTypeText = (child?.orgType || "").toString().trim().toLowerCase();
                  return orgTypeText === "company" || isCeoNode(child);
                });

              // If non-Group org node has no direct people card (employee/vacant), lift child org nodes up one level.
              // Vacant is treated as a people card and must keep this node.
              if (
                (currentNode.orgType || "") !== "Group"
                && !hasDirectPeopleOrVacant
                && orgChildren.length > 0
              ) {
                acc.push(...orgChildren);
                return acc;
              }

              // Drop synthetic group wrappers that only contain company-level people (e.g. CEO Office -> CEO card).
              if (
                (currentNode.orgType || "") === "Group"
                && orgChildren.length === 0
                && hasOnlyCompanyLevelPeople
              ) {
                acc.push(...directPeopleChildren);
                return acc;
              }

              // Remove org nodes that do not contain any real employee in their subtree.
              if (!hasRealEmployeeDescendant(currentNode)) {
                return acc;
              }
            }

            acc.push(currentNode);
            return acc;
          }, []);
        };

        const stripEmployeeIdsFromTree = (nodes, excludedIds) => {
          return (nodes || []).reduce((acc, node) => {
            if (!node) return acc;
            if (!node.isOrgNode && excludedIds.has(node.id)) return acc;
            const nextNode = {
              ...node,
              subordinates: stripEmployeeIdsFromTree(node.subordinates || [], excludedIds)
            };
            acc.push(nextNode);
            return acc;
          }, []);
        };

        const roots = Array.from(groupMap.values());
        const cleanedRoots = pruneRedundantOrgNodes(roots);
        sortOrgTree(cleanedRoots);

        // In Organization view, anchor hierarchy under CEO (Company level) when available.
        const ceoCandidates = scoped.filter((employee) => isCeoNode(employee));
        if (ceoCandidates.length === 0) {
          return cleanedRoots;
        }

        const [primaryCeo] = [...ceoCandidates].sort(compareReportOrder);
        const ceoIds = new Set(ceoCandidates.map((employee) => employee.id));
        const orgRootsWithoutCeoCards = stripEmployeeIdsFromTree(cleanedRoots, ceoIds);
        sortOrgTree(orgRootsWithoutCeoCards);

        return [{
          ...primaryCeo,
          subordinates: orgRootsWithoutCeoCards
        }];
      };

      const OrgChartVertical = () => {
        const [treeData, setTreeData] = useState([]); 
        const [selectedEmployee, setSelectedEmployee] = useState(null);
        const [searchQuery, setSearchQuery] = useState("");
        const [selectedGroup, setSelectedGroup] = useState("all");
        const [selectedDivision, setSelectedDivision] = useState("all");
        const [selectedDepartment, setSelectedDepartment] = useState("all");
        const [selectedUnit, setSelectedUnit] = useState("all");
        const [selectedCorporateTitle, setSelectedCorporateTitle] = useState("all");
        const [viewMode, setViewMode] = useState("reporting");
        const [zoomLevel, setZoomLevel] = useState(100);
        const [expandedNodes, setExpandedNodes] = useState(new Set());        
        const [isHandTool, setIsHandTool] = useState(false);
        const [isPanning, setIsPanning] = useState(false);
        const [startPan, setStartPan] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
        const scrollContainerRef = useRef(null);
        const pendingCenterNodeIdRef = useRef(null);

        const centerNodeInView = (nodeId) => {
          const container = scrollContainerRef.current;
          if (!container || !nodeId) return;

          const escapedNodeId = window.CSS?.escape ? window.CSS.escape(nodeId) : nodeId.replace(/"/g, "\\\"");
          const nodeEl = container.querySelector(`[data-org-node-id=\"${escapedNodeId}\"]`);
          if (!nodeEl) return;

          const containerRect = container.getBoundingClientRect();
          const nodeRect = nodeEl.getBoundingClientRect();

          const deltaX = (nodeRect.left + (nodeRect.width / 2)) - (containerRect.left + (containerRect.width / 2));
          const deltaY = (nodeRect.top + (nodeRect.height / 2)) - (containerRect.top + (containerRect.height / 2));

          const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
          const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
          const targetLeft = Math.min(maxScrollLeft, Math.max(0, container.scrollLeft + deltaX));
          const targetTop = Math.min(maxScrollTop, Math.max(0, container.scrollTop + deltaY));

          container.scrollTo({ left: targetLeft, top: targetTop, behavior: "smooth" });
        };

        const handleMouseDown = (e) => {
          if (!isHandTool) return;
          setIsPanning(true);
          const container = scrollContainerRef.current;
          setStartPan({
            x: e.pageX - container.offsetLeft,
            y: e.pageY - container.offsetTop,
            scrollLeft: container.scrollLeft,
            scrollTop: container.scrollTop
          });
        };

        const handleMouseMove = (e) => {
          if (!isPanning || !isHandTool) return;
          e.preventDefault();
          const container = scrollContainerRef.current;
          const x = e.pageX - container.offsetLeft;
          const y = e.pageY - container.offsetTop;
          const walkX = (x - startPan.x) * 1.5;
          const walkY = (y - startPan.y) * 1.5;
          container.scrollLeft = startPan.scrollLeft - walkX;
          container.scrollTop = startPan.scrollTop - walkY;
        };

        const handleMouseUp = () => { setIsPanning(false); };

        // [MODIFIED] Handle both CSV and Excel
        const handleFileUpload = (event) => {
          const file = event.target.files[0];
          if (!file) return;

          const fileExt = file.name.split('.').pop().toLowerCase();
          
          const processData = (rawData) => {
             if (rawData.length > 0) {
                 // Check valid data
                 const firstRow = rawData[0];
                 const hasId = Object.keys(firstRow).some(k => k.trim() === "Employee ID CardX");
                 
                 if (!hasId) { 
                     alert("Format ไม่ถูกต้อง: ไม่พบ column 'Employee ID CardX'"); 
                     return; 
                 }
                 const hierarchy = buildHierarchy(rawData);
                 setTreeData(hierarchy);
                 const rootIds = hierarchy.map(n => n.id);
                 setExpandedNodes(new Set(rootIds));
                 setSelectedGroup("all");
                 setSelectedDivision("all");
                 setSelectedDepartment("all");
                 setSelectedUnit("all");
                 setSelectedCorporateTitle("all");
                 setSearchQuery("");
             }
          };

          if (fileExt === 'csv') {
            // Process CSV with PapaParse
            Papa.parse(file, {
              header: true, skipEmptyLines: true,
              complete: (results) => processData(results.data)
            });
          } else if (['xlsx', 'xls'].includes(fileExt)) {
            // Process Excel with SheetJS
            const reader = new FileReader();
            reader.onload = (e) => {
              const data = new Uint8Array(e.target.result);
              const workbook = XLSX.read(data, { type: 'array' });
              
              // Get first sheet
              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];
              
              // Convert to JSON (raw: false ensures dates are formatted closer to display string, or handle in formatDate)
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
              processData(jsonData);
            };
            reader.readAsArrayBuffer(file);
          } else {
             alert("รองรับเฉพาะไฟล์ .csv, .xlsx, .xls เท่านั้น");
          }
        };

        const allEmployees = useMemo(() => flattenTreeNodes(treeData), [treeData]);

        const getUniqueOptions = (items, key, sorter) => {
          const values = Array.from(
            new Set(
              items
                .map((item) => (item[key] || "").toString().trim())
                .filter(Boolean)
            )
          );
          return sorter ? values.sort(sorter) : values.sort((a, b) => a.localeCompare(b));
        };

        const groupOptions = useMemo(() => getUniqueOptions(allEmployees, "groupName"), [allEmployees]);
        const corporateTitleOptions = useMemo(
          () => getUniqueOptions(allEmployees, "corporateTitle", compareCorporateTitle),
          [allEmployees]
        );
        const divisionOptions = useMemo(() => {
          const scoped = selectedGroup === "all"
            ? allEmployees
            : allEmployees.filter((item) => item.groupName === selectedGroup);
          return getUniqueOptions(scoped, "divisionName");
        }, [allEmployees, selectedGroup]);
        const departmentOptions = useMemo(() => {
          const scoped = allEmployees.filter((item) => {
            if (selectedGroup !== "all" && item.groupName !== selectedGroup) return false;
            if (selectedDivision !== "all" && item.divisionName !== selectedDivision) return false;
            return true;
          });
          return getUniqueOptions(scoped, "departmentName");
        }, [allEmployees, selectedGroup, selectedDivision]);
        const unitOptions = useMemo(() => {
          const scoped = allEmployees.filter((item) => {
            if (selectedGroup !== "all" && item.groupName !== selectedGroup) return false;
            if (selectedDivision !== "all" && item.divisionName !== selectedDivision) return false;
            if (selectedDepartment !== "all" && item.departmentName !== selectedDepartment) return false;
            return true;
          });
          return getUniqueOptions(scoped, "unitName");
        }, [allEmployees, selectedGroup, selectedDivision, selectedDepartment]);

        useEffect(() => {
          if (selectedDivision !== "all" && !divisionOptions.includes(selectedDivision)) {
            setSelectedDivision("all");
          }
        }, [selectedDivision, divisionOptions]);

        useEffect(() => {
          if (selectedDepartment !== "all" && !departmentOptions.includes(selectedDepartment)) {
            setSelectedDepartment("all");
          }
        }, [selectedDepartment, departmentOptions]);

        useEffect(() => {
          if (selectedUnit !== "all" && !unitOptions.includes(selectedUnit)) {
            setSelectedUnit("all");
          }
        }, [selectedUnit, unitOptions]);

        useEffect(() => {
          if (selectedCorporateTitle !== "all" && !corporateTitleOptions.includes(selectedCorporateTitle)) {
            setSelectedCorporateTitle("all");
          }
        }, [selectedCorporateTitle, corporateTitleOptions]);

        const matchesStructureFilter = (node) => {
          if (selectedGroup !== "all" && node.groupName !== selectedGroup) return false;
          if (selectedDivision !== "all" && node.divisionName !== selectedDivision) return false;
          if (selectedDepartment !== "all" && node.departmentName !== selectedDepartment) return false;
          if (selectedUnit !== "all" && node.unitName !== selectedUnit) return false;
          return true;
        };

        const matchesHierarchyFilter = (node) => {
          if (!matchesStructureFilter(node)) return false;
          if (selectedCorporateTitle !== "all" && node.corporateTitle !== selectedCorporateTitle) return false;
          return true;
        };

        const ceoNodeIds = useMemo(() => {
          const ids = new Set();
          allEmployees.forEach((employee) => {
            if (isCeoNode(employee)) ids.add(employee.id);
          });
          return ids;
        }, [allEmployees]);

        const hasStructureFilters = selectedGroup !== "all"
          || selectedDivision !== "all"
          || selectedDepartment !== "all"
          || selectedUnit !== "all";

        const shouldShowCeoByStructureFilter = useMemo(() => {
          if (!hasStructureFilters || ceoNodeIds.size === 0) return true;
          return allEmployees.some((employee) => {
            if (!matchesStructureFilter(employee)) return false;
            const managerId = (employee.manager_id || "").toString().trim();
            return !!managerId && ceoNodeIds.has(managerId);
          });
        }, [
          allEmployees,
          ceoNodeIds,
          hasStructureFilters,
          selectedGroup,
          selectedDivision,
          selectedDepartment,
          selectedUnit
        ]);

        const filterNodes = (nodes, query) => {
          return nodes.reduce((acc, node) => {
            const matchesSearch = matchesNodeSearch(node, query);
            const matchesOrg = matchesHierarchyFilter(node);
            const filteredSubordinates = node.subordinates ? filterNodes(node.subordinates, query) : [];
            if ((matchesSearch && matchesOrg) || filteredSubordinates.length > 0) {
              const shouldSuppressCeo = hasStructureFilters
                && ceoNodeIds.has(node.id)
                && !shouldShowCeoByStructureFilter;
              if (shouldSuppressCeo) {
                // Keep filtered branch visible while suppressing CEO ancestor for scoped hierarchy filters.
                acc.push(...filteredSubordinates);
              } else {
                acc.push({ ...node, subordinates: filteredSubordinates });
              }
            }
            return acc;
          }, []);
        };

        const hasHierarchyFilters = hasStructureFilters || selectedCorporateTitle !== "all";

        const baseFilteredEmployees = useMemo(() => {
          if (!searchQuery && !hasHierarchyFilters) return treeData;
          return filterNodes(treeData, searchQuery);
        }, [treeData, searchQuery, selectedGroup, selectedDivision, selectedDepartment, selectedUnit, selectedCorporateTitle, hasHierarchyFilters]);

        const scopedEmployeesForOrgView = useMemo(() => {
          return allEmployees.filter((employee) => matchesHierarchyFilter(employee) && matchesNodeSearch(employee, searchQuery));
        }, [
          allEmployees,
          searchQuery,
          selectedGroup,
          selectedDivision,
          selectedDepartment,
          selectedUnit,
          selectedCorporateTitle
        ]);

        const filteredEmployees = useMemo(() => {
          if (viewMode === "organization") {
            return buildOrganizationHierarchyTree(scopedEmployeesForOrgView);
          }
          return baseFilteredEmployees;
        }, [
          baseFilteredEmployees,
          viewMode,
          scopedEmployeesForOrgView
        ]);

        const displayFlatEmployees = useMemo(() => flattenTreeNodes(filteredEmployees), [filteredEmployees]);
        const useWrappedLayout = false;
        const summaryFlatEmployees = useMemo(() => {
          return allEmployees.filter((employee) => matchesHierarchyFilter(employee) && matchesNodeSearch(employee, searchQuery));
        }, [
          allEmployees,
          searchQuery,
          selectedGroup,
          selectedDivision,
          selectedDepartment,
          selectedUnit,
          selectedCorporateTitle
        ]);
        const summaryTotals = useMemo(() => {
          const manpower = summaryFlatEmployees.length;
          const headcount = summaryFlatEmployees.filter((employee) => !employee.isVacant).length;
          const vacant = manpower - headcount;
          return { manpower, headcount, vacant };
        }, [summaryFlatEmployees]);

        const corporateTitleSummary = useMemo(() => {
          const titleMap = new Map();
          summaryFlatEmployees.forEach((employee) => {
            const title = (employee.corporateTitle || "Not Specified").toString().trim() || "Not Specified";
            titleMap.set(title, (titleMap.get(title) || 0) + 1);
          });

          return Array.from(titleMap.entries())
            .map(([title, total]) => ({ title, total }))
            .sort((a, b) =>
              (getCorporateTitleRank(a.title) - getCorporateTitleRank(b.title))
              || (b.total - a.total)
              || a.title.localeCompare(b.title)
            );
        }, [summaryFlatEmployees]);

        const vacantCorporateTitleSummary = useMemo(() => {
          const titleMap = new Map();
          summaryFlatEmployees
            .filter((employee) => employee.isVacant)
            .forEach((employee) => {
              const title = (employee.corporateTitle || "Not Specified").toString().trim() || "Not Specified";
              titleMap.set(title, (titleMap.get(title) || 0) + 1);
            });

          return Array.from(titleMap.entries())
            .map(([title, total]) => ({ title, total }))
            .sort((a, b) =>
              (getCorporateTitleRank(a.title) - getCorporateTitleRank(b.title))
              || (b.total - a.total)
              || a.title.localeCompare(b.title)
            );
        }, [summaryFlatEmployees]);

        const { exportingType, handleExport } = useOrgChartExport({
          treeData,
          viewMode,
          selectedGroup,
          selectedDivision,
          selectedDepartment,
          selectedUnit,
          selectedCorporateTitle,
          searchQuery,
          summaryTotals,
          corporateTitleSummary,
          vacantCorporateTitleSummary,
          logoSources: {
            remote: CARDX_LOGO_REMOTE,
            local: CARDX_LOGO_LOCAL,
            inline: CARDX_LOGO_INLINE
          }
        });

        const handleClearFilters = () => {
          setSearchQuery("");
          setSelectedGroup("all");
          setSelectedDivision("all");
          setSelectedDepartment("all");
          setSelectedUnit("all");
          setSelectedCorporateTitle("all");
        };

        const handleExpandAll = (centerOnFirstRoot = false) => {
            const allIds = new Set();
            const traverse = (nodes) => {
                nodes.forEach(n => {
                    allIds.add(n.id);
                    if(n.subordinates) traverse(n.subordinates);
                });
            }
            traverse(filteredEmployees);
            pendingCenterNodeIdRef.current = centerOnFirstRoot
              ? (filteredEmployees[0]?.id || null)
              : null;
            setExpandedNodes(allIds);
        }

        const handleCollapseAll = () => {
            const rootIds = filteredEmployees.map(n => n.id);
            setExpandedNodes(new Set(rootIds));
        }

        useEffect(() => {
          if (viewMode === "organization" || searchQuery || hasHierarchyFilters) {
            handleExpandAll();
          }
        }, [viewMode, searchQuery, hasHierarchyFilters, filteredEmployees]);

        const toggleNode = (nodeId) => {
          setExpandedNodes((prev) => {
            const next = new Set(prev);
            const willExpand = !next.has(nodeId);
            if (willExpand) next.add(nodeId); else next.delete(nodeId);
            pendingCenterNodeIdRef.current = willExpand ? nodeId : null;
            return next;
          });
        };

        useEffect(() => {
          const nodeId = pendingCenterNodeIdRef.current;
          if (!nodeId) return;

          const rafId = requestAnimationFrame(() => {
            centerNodeInView(nodeId);
            pendingCenterNodeIdRef.current = null;
          });

          return () => cancelAnimationFrame(rafId);
        }, [expandedNodes]);

        return (
          <div className="h-screen bg-slate-50 flex flex-col">
            <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm flex-shrink-0">
              <div className="px-3 sm:px-6 lg:px-8 py-2">
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <img
                      src={IS_FILE_ORIGIN ? HRIS_LOGO_LOCAL : HRIS_LOGO_REMOTE}
                      onError={(e) => {
                        if (e.currentTarget.src !== new URL(HRIS_LOGO_LOCAL, window.location.href).href) {
                          e.currentTarget.src = HRIS_LOGO_LOCAL;
                        }
                      }}
                      alt="Company Logo"
                      className="w-16 h-12 sm:w-20 sm:h-14 object-contain rounded-lg flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <h1 className="text-base sm:text-lg font-semibold text-slate-900 leading-tight">Organization Chart</h1>
                      <p className="text-xs text-slate-500">Live Data View</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <div className="file-input-wrapper">
                      <button className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center gap-2 shadow-sm">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Upload Excel/CSV
                      </button>
                      <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} />
                    </div>
                    
                    <button 
                        onClick={() => setIsHandTool(!isHandTool)} 
                        className={`p-2 rounded-lg transition-colors border ${isHandTool ? 'bg-blue-100 text-blue-600 border-blue-200 shadow-inner' : 'hover:bg-slate-100 text-slate-600 border-transparent'}`}
                        title={isHandTool ? "Disable Hand Tool" : "Enable Hand Tool"}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg>
                    </button>

                    <div className="h-6 w-px bg-slate-300 mx-1"></div>

                    <button onClick={() => setZoomLevel(Math.max(50, zoomLevel - 10))} className="p-2 hover:bg-slate-100 rounded-lg">-</button>
                    <span className="text-sm font-medium text-slate-600 w-12 text-center">{zoomLevel}%</span>
                    <button onClick={() => setZoomLevel(Math.min(150, zoomLevel + 10))} className="p-2 hover:bg-slate-100 rounded-lg">+</button>
                    <button
                      onClick={() => handleExport("png")}
                      disabled={!!exportingType || treeData.length === 0}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      {exportingType === "png" ? "PROCESSING..." : "EXPORT PNG"}
                    </button>
                    <button
                      onClick={() => handleExport("pdf")}
                      disabled={!!exportingType || treeData.length === 0}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      {exportingType === "pdf" ? "PROCESSING..." : "EXPORT PDF"}
                    </button>
                    <div className="h-6 w-px bg-slate-300 mx-1"></div>

                    <button onClick={() => handleExpandAll(true)} className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Expand All</button>
                    <button onClick={handleCollapseAll} className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Collapse</button>
                  </div>
                </div>
              </div>
            </header>

            <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3 flex-shrink-0 relative z-10">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Search by Emp ID / Name / Position"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:flex-1 sm:min-w-[220px] sm:max-w-md px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none min-w-[190px] sm:min-w-[220px]"
                >
                  <option value="reporting">View: Reporting Line</option>
                  <option value="organization">View: Organization Hierarchy</option>
                </select>
                <select
                  value={selectedGroup}
                  onChange={(e) => {
                    setSelectedGroup(e.target.value);
                    setSelectedDivision("all");
                    setSelectedDepartment("all");
                    setSelectedUnit("all");
                  }}
                  className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none min-w-[150px] sm:min-w-[170px]"
                >
                  <option value="all">Group: All</option>
                  {groupOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <select
                  value={selectedDivision}
                  onChange={(e) => {
                    setSelectedDivision(e.target.value);
                    setSelectedDepartment("all");
                    setSelectedUnit("all");
                  }}
                  className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none min-w-[180px] sm:min-w-[220px]"
                >
                  <option value="all">Division: All</option>
                  {divisionOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <select
                  value={selectedDepartment}
                  onChange={(e) => {
                    setSelectedDepartment(e.target.value);
                    setSelectedUnit("all");
                  }}
                  className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none min-w-[180px] sm:min-w-[220px]"
                >
                  <option value="all">Department: All</option>
                  {departmentOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none min-w-[170px] sm:min-w-[200px]"
                >
                  <option value="all">Unit: All</option>
                  {unitOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <select
                  value={selectedCorporateTitle}
                  onChange={(e) => setSelectedCorporateTitle(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none min-w-[180px] sm:min-w-[220px]"
                >
                  <option value="all">Corporate Title: All</option>
                  {corporateTitleOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <button
                  onClick={handleClearFilters}
                  className="w-full sm:w-auto px-3 py-2 text-sm font-semibold text-sky-700 bg-sky-100 border border-sky-300 rounded-lg hover:bg-sky-200 hover:border-sky-400 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
              <p className="mt-2 text-xs text-indigo-700">
                {viewMode === "organization"
                  ? "Hierarchy View Mode: Group > Division > Department > Unit"
                  : "Reporting View Mode: Direct Report"}
              </p>
            </div>

            <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-1.5 flex-shrink-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-slate-700">Summary by Corporate Title</h3>
                <div className="flex items-center justify-end flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">Manpower: {summaryTotals.manpower}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">Headcount: {summaryTotals.headcount}</span>
                  {summaryTotals.vacant > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Vacant: {summaryTotals.vacant}</span>
                  )}
                </div>
              </div>
              <div className="max-h-20 overflow-auto pr-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-1">
                {corporateTitleSummary.length === 0 ? (
                  <div className="text-xs text-slate-400">No summary data</div>
                ) : (
                  corporateTitleSummary.map((item) => (
                    <div key={item.title} className="border border-slate-200 rounded-md px-2 py-1 bg-slate-50">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-slate-700 truncate pr-2" title={item.title}>{item.title}</p>
                        <span className="text-[10px] font-bold text-slate-500">{item.total}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {vacantCorporateTitleSummary.length > 0 && (
                <div className="mt-1.5 flex items-center flex-wrap gap-1.5">
                  <span className="text-[11px] font-semibold text-amber-700">Vacant by Corporate Title:</span>
                  {vacantCorporateTitleSummary.map((item) => (
                    <span key={`vacant-${item.title}`} className="px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-[10px] font-semibold text-amber-700">
                      {item.title}: {item.total}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div 
                ref={scrollContainerRef}
                className={`flex-1 bg-slate-50 relative
                    ${isHandTool ? 'overflow-hidden cursor-grab' : 'overflow-auto'} 
                    ${isPanning ? 'cursor-grabbing select-none' : ''}
                `}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
              <div className="org-export-viewport inline-block min-w-full p-8 text-center" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "top center" }}>
                <div className="org-tree">
                  {treeData.length === 0 ? (
                    <div className="mt-20 text-slate-400">
                      <p className="text-lg font-medium">No Data</p>
                      <p className="text-sm">Please upload CSV or Excel (.xlsx)</p>
                    </div>
                  ) : (
                    filteredEmployees.map((emp) => (
                      <EmployeeCard
                        key={emp.id}
                        employee={emp}
                        level={0}
                        useWrappedLayout={useWrappedLayout}
                        expandedNodes={expandedNodes}
                        isPanning={isPanning}
                        onSelectEmployee={setSelectedEmployee}
                        onToggleNode={toggleNode}
                        formatDate={formatDate}
                        getEmployeeInitials={getEmployeeInitials}
                        getOrgBadgeColor={getOrgBadgeColor}
                        chunkArray={chunkArray}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            <EmployeeDetailsModal
              selectedEmployee={selectedEmployee}
              onClose={() => setSelectedEmployee(null)}
              formatDate={formatDate}
              getEmployeeInitials={getEmployeeInitials}
            />
          </div>
        );
      };

export default OrgChartVertical;
