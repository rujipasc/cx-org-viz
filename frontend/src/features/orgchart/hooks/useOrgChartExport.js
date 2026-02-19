import { useState } from "react";

const EXPORT_BRAND_FONT = '"CardXBrand", "Segoe UI", Arial, sans-serif';
const EXPORT_MODE_CLASS = "export-mode";

const ensureExportFontLoaded = async (fontSize = 16) => {
  if (!document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load(`400 ${fontSize}px ${EXPORT_BRAND_FONT}`),
      document.fonts.load(`600 ${fontSize}px ${EXPORT_BRAND_FONT}`),
      document.fonts.load(`700 ${fontSize}px ${EXPORT_BRAND_FONT}`),
      document.fonts.ready
    ]);
  } catch (error) {
    console.warn("Brand font load fallback:", error?.message || error);
  }
};

function useOrgChartExport({
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
  logoSources
}) {
  const [exportingType, setExportingType] = useState(null);

  const CARDX_LOGO_REMOTE = logoSources?.remote;
  const CARDX_LOGO_LOCAL = logoSources?.local;
  const CARDX_LOGO_INLINE = logoSources?.inline;

  const withExportMode = async (fn) => {
    document.body?.classList?.add?.(EXPORT_MODE_CLASS);
    try {
      // Ensure fonts are ready before html2canvas snapshots (prevents layout shift / fallback font)
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      return await fn();
    } finally {
      document.body?.classList?.remove?.(EXPORT_MODE_CLASS);
    }
  };

  const getRelativeRectInContainer = (element, container) => {
    let x = 0;
    let y = 0;
    let node = element;

    while (node && node !== container) {
      x += node.offsetLeft || 0;
      y += node.offsetTop || 0;
      node = node.offsetParent;
    }

    if (node !== container) {
      const elementRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return {
        x: elementRect.left - containerRect.left,
        y: elementRect.top - containerRect.top,
        width: elementRect.width,
        height: elementRect.height
      };
    }

    return {
      x,
      y,
      width: element.offsetWidth || 0,
      height: element.offsetHeight || 0
    };
  };

  const getTreeContentBounds = (container) => {
    const cards = Array.from(container.querySelectorAll(".org-node > div:first-child")).filter((card) => {
      if ((card.offsetWidth || 0) < 20 || (card.offsetHeight || 0) < 20) return false;
      const nameText = card.querySelector("h3")?.textContent?.trim() || "";
      const positionText = card.querySelector("p")?.textContent?.trim() || "";
      return Boolean(nameText || positionText);
    });

    if (cards.length === 0) {
      return { x: 0, y: 0, width: container.scrollWidth, height: container.scrollHeight };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    cards.forEach((card) => {
      const rect = getRelativeRectInContainer(card, container);
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    });

    // Keep capture tight so cards render larger in the final 16:9 frame.
    const trimPadding = 10; // tighter than before
    const x = Math.max(0, Math.floor(minX - trimPadding));
    const y = Math.max(0, Math.floor(minY - trimPadding));
    const width = Math.min(container.scrollWidth - x, Math.ceil((maxX - minX) + (trimPadding * 2)));
    const height = Math.min(container.scrollHeight - y, Math.ceil((maxY - minY) + (trimPadding * 2)));

    return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
  };

  const applyExportWrap = (container) => {
    if (!container || !(container instanceof HTMLElement)) {
      return () => {};
    }

    const styleSnapshot = new Map();
    const rememberOriginalStyle = (element) => {
      if (!element || styleSnapshot.has(element)) return;
      styleSnapshot.set(element, element.getAttribute("style"));
    };

    const applyStyles = (element, styles) => {
      if (!element) return;
      rememberOriginalStyle(element);
      Object.entries(styles).forEach(([property, value]) => {
        element.style[property] = value;
      });
    };

    applyStyles(container, {
      transform: "none",
      padding: "0px",
      margin: "0px"
    });

    const viewport = container.ownerDocument?.querySelector?.(".org-export-viewport");
    applyStyles(viewport, {
      transform: "none",
      transformOrigin: "top center",
      padding: "0px",
      margin: "0px"
    });

    container.querySelectorAll(".org-level").forEach((level) => {
      applyStyles(level, { gap: "0.65rem" });
    });

    container.querySelectorAll(".org-level-wrap").forEach((wrap) => {
      applyStyles(wrap, {
        gap: "0.55rem 0.75rem",
        width: "auto",
        maxWidth: "3000px",
        justifyContent: "center"
      });
    });

    container.querySelectorAll(".org-level").forEach((level) => {
      const childNodes = level.querySelectorAll(":scope > .org-node").length;
      if (childNodes < 7) return;
      applyStyles(level, {
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0.55rem",
        display: "flex",
        width: "3000px",
        maxWidth: "3000px",
        marginLeft: "auto",
        marginRight: "auto"
      });
    });

    container.querySelectorAll(".org-level-wrap + .org-level-wrap").forEach((el) => {
      applyStyles(el, { marginTop: "0.55rem" });
    });

    return () => {
      styleSnapshot.forEach((inlineStyle, element) => {
        if (inlineStyle === null) {
          element.removeAttribute("style");
        } else {
          element.setAttribute("style", inlineStyle);
        }
      });
    };
  };

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    const resolvedSrc = new URL(src, window.location.href).href;
    const resolvedProtocol = new URL(resolvedSrc).protocol;
    if (resolvedProtocol === "http:" || resolvedProtocol === "https:") {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = resolvedSrc;
  });

  const loadFirstAvailableImage = async (sources) => {
    let lastError = null;
    for (const src of sources || []) {
      if (!src) continue;
      try {
        const img = await loadImage(src);
        return { img, src };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("No available image sources");
  };

  const isImageCanvasSafe = (img) => {
    try {
      const testCanvas = document.createElement("canvas");
      testCanvas.width = 1;
      testCanvas.height = 1;
      const testCtx = testCanvas.getContext("2d", { willReadFrequently: true });
      testCtx.drawImage(img, 0, 0, 1, 1);
      testCtx.getImageData(0, 0, 1, 1);
      return true;
    } catch (error) {
      return false;
    }
  };

  const loadFirstCanvasSafeImage = async (sources) => {
    let lastError = null;
    for (const src of sources || []) {
      if (!src) continue;
      try {
        const loaded = await loadFirstAvailableImage([src]);
        if (!isImageCanvasSafe(loaded.img)) {
          lastError = new Error(`Image source is not canvas-safe: ${src}`);
          continue;
        }
        return loaded;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("No canvas-safe image sources");
  };

  const canvasToBlob = (canvas, mimeType, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) {
        reject(new Error("Rendered image is empty. Please try export again."));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });

  const isWailsRuntimeAvailable = () => {
    return typeof window !== "undefined"
      && !!window.go
      && !!window.go.main
      && !!window.go.main.App
      && typeof window.go.main.App.SaveExportFile === "function";
  };

  const isUserCancelError = (error) => {
    const text = (error?.message || error?.toString?.() || "").toLowerCase();
    return text.includes("cancelled") || text.includes("canceled");
  };

  const saveExportThroughWails = async (filename, extension, dataUrl) => {
    if (!isWailsRuntimeAvailable()) return false;
    try {
      await window.go.main.App.SaveExportFile(filename, extension, dataUrl);
      return true;
    } catch (error) {
      if (isUserCancelError(error)) return true;
      throw error;
    }
  };

  const assertCanvasExportSafe = (canvas) => {
    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.getImageData(0, 0, 1, 1);
    } catch (error) {
      throw new Error(
        "Export blocked by browser security (cross-origin image). " +
        "Please hard refresh and use inline/local assets only."
      );
    }
  };

  const getOpaqueImageBounds = (img) => {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    tempCtx.drawImage(img, 0, 0, w, h);
    let pixels;
    try {
      pixels = tempCtx.getImageData(0, 0, w, h).data;
    } catch (error) {
      return { sx: 0, sy: 0, sw: w, sh: h };
    }

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const alpha = pixels[((y * w) + x) * 4 + 3];
        if (alpha > 8) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return { sx: 0, sy: 0, sw: w, sh: h };
    }

    return {
      sx: minX,
      sy: minY,
      sw: (maxX - minX) + 1,
      sh: (maxY - minY) + 1
    };
  };

  const drawWrappedText = (ctx, text, x, y, maxWidth, lineHeight, maxLines) => {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";

    words.forEach((word) => {
      const nextLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(nextLine).width <= maxWidth) {
        line = nextLine;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);

    const drawnLines = lines.slice(0, maxLines);
    drawnLines.forEach((l, idx) => {
      ctx.fillText(l, x, y + (idx * lineHeight));
    });
    return drawnLines.length;
  };

  const fitText = (ctx, text, maxWidth) => {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) {
      out = out.slice(0, -1);
    }
    return `${out}...`;
  };

  const getCurrentFilterLabel = () => {
    const viewLabel = viewMode === "organization"
      ? "Organization Hierarchy (Group > Division > Department > Unit)"
      : "Reporting Line";
    if (selectedCorporateTitle !== "all") return `${viewLabel} | ${selectedCorporateTitle}`;
    if (selectedUnit !== "all") return `${viewLabel} | ${selectedUnit}`;
    if (selectedDepartment !== "all") return `${viewLabel} | ${selectedDepartment}`;
    if (selectedDivision !== "all") return `${viewLabel} | ${selectedDivision}`;
    if (selectedGroup !== "all") return `${viewLabel} | ${selectedGroup}`;
    return `${viewLabel} | All Organizations`;
  };

  const drawCiOverlay = async (ctx, finalWidth, finalHeight, phase = "foreground") => {
    const sidePadding = Math.round(finalWidth * 0.015);
    const brandLeftX = sidePadding;
    const topPadding = Math.round(finalHeight * 0.022);
    const logoTopWidth = Math.round(finalWidth * 0.1);
    const logoBottomWidth = Math.round(finalWidth * 0.08);
    const dynamicLabel = getCurrentFilterLabel();
    const dynamicText = searchQuery ? `${dynamicLabel} | Search: ${searchQuery}` : dynamicLabel;

    if (phase === "background") {
      const gradientWidth = Math.round(finalWidth * 0.35);
      const gradientHeight = Math.round(finalHeight * 0.28);
      const glowCenterX = finalWidth - (gradientWidth * 0.18);
      const glowCenterY = finalHeight - (gradientHeight * 0.12);
      const glowRadius = Math.round(Math.max(gradientWidth, gradientHeight) * 0.95);
      const gradient = ctx.createRadialGradient(
        glowCenterX,
        glowCenterY,
        0,
        glowCenterX,
        glowCenterY,
        glowRadius
      );
      gradient.addColorStop(0, "rgba(61, 197, 236, 0.45)");
      gradient.addColorStop(0.55, "rgba(61, 197, 236, 0.18)");
      gradient.addColorStop(1, "rgba(61, 197, 236, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(
        glowCenterX,
        glowCenterY,
        gradientWidth * 0.9,
        gradientHeight * 0.95,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      return;
    }

    let logoHeightTop = Math.round(logoTopWidth * 0.36);
    let logoHeightBottom = Math.round(logoBottomWidth * 0.36);
    try {
      const exportLogoSources = [CARDX_LOGO_INLINE, CARDX_LOGO_LOCAL, CARDX_LOGO_REMOTE].filter(Boolean);
      const { img: logoImg } = await loadFirstCanvasSafeImage(exportLogoSources);
      const logoBounds = getOpaqueImageBounds(logoImg);
      const logoAspect = logoBounds.sw / Math.max(1, logoBounds.sh);
      logoHeightTop = Math.round(logoTopWidth / Math.max(0.01, logoAspect));
      logoHeightBottom = Math.round(logoBottomWidth / Math.max(0.01, logoAspect));
      ctx.drawImage(
        logoImg,
        logoBounds.sx,
        logoBounds.sy,
        logoBounds.sw,
        logoBounds.sh,
        brandLeftX,
        topPadding,
        logoTopWidth,
        logoHeightTop
      );
      const logoBottomX = finalWidth - sidePadding - logoBottomWidth;
      const logoBottomY = finalHeight - Math.round(finalHeight * 0.04) - logoHeightBottom;
      ctx.drawImage(
        logoImg,
        logoBounds.sx,
        logoBounds.sy,
        logoBounds.sw,
        logoBounds.sh,
        logoBottomX,
        logoBottomY,
        logoBottomWidth,
        logoHeightBottom
      );
    } catch (logoError) {
      console.warn(logoError.message);
    }

    const textX = brandLeftX;
    const textY = topPadding + logoHeightTop + Math.round(finalHeight * 0.035);
    const maxTextWidth = Math.round(finalWidth * 0.28);
    const fontSize = Math.max(16, Math.round(finalHeight * 0.029));
    const lineHeight = Math.round(fontSize * 1.15);
    await ensureExportFontLoaded(fontSize);

    ctx.fillStyle = "#56B0DE";
    ctx.font = `700 ${fontSize}px ${EXPORT_BRAND_FONT}`;
    ctx.textAlign = "left";
    const drawnLineCount = drawWrappedText(ctx, dynamicText, textX, textY, maxTextWidth, lineHeight, 3);

    const lineY = finalHeight - Math.round(finalHeight * 0.045);
    const summaryStartY = textY + (Math.max(1, drawnLineCount) * lineHeight) + Math.round(finalHeight * 0.012);
    const summaryWidth = Math.round(finalWidth * 0.17);
    const summaryValueX = textX + summaryWidth;
    const summaryHeaderSize = Math.max(12, Math.round(finalHeight * 0.0145));
    const summaryRowSize = Math.max(11, Math.round(finalHeight * 0.0135));
    const summaryRowHeight = Math.round(summaryRowSize * 1.45);
    const tableValueLineHeight = Math.max(Math.round(summaryRowSize * 1.2), 14);
    const vacantTitleText = vacantCorporateTitleSummary
      .map((item) => `${item.title} (${item.total})`)
      .join(", ");
    const vacantDetailsText = vacantTitleText || "-";

    const tableRows = [
      { label: "Manpower", value: String(summaryTotals.manpower), color: "#334155", wrap: false },
      { label: "Headcount", value: String(summaryTotals.headcount), color: "#334155", wrap: false },
      { label: "Vacant", value: String(summaryTotals.vacant), color: "#7c2d12", wrap: false },
      { label: "Vacant details", value: vacantDetailsText, color: "#7c2d12", wrap: true }
    ];

    const tableLeft = textX;
    const tableTop = summaryStartY;
    const tableWidth = Math.round(finalWidth * 0.2);
    const tableSplitX = tableLeft + Math.round(tableWidth * 0.3);
    const valueWidth = Math.max(40, tableLeft + tableWidth - tableSplitX - Math.round(finalWidth * 0.008));

    const wrapValueLines = (value, maxWidth) => {
      const words = (value || "").toString().split(/\s+/).filter(Boolean);
      if (words.length === 0) return ["-"];
      const lines = [];
      let line = "";
      words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
          line = candidate;
        } else {
          if (line) lines.push(line);
          line = word;
        }
      });
      if (line) lines.push(line);
      return lines;
    };

    const tableRowLayouts = tableRows.map((row) => {
      ctx.font = `600 ${summaryRowSize}px ${EXPORT_BRAND_FONT}`;
      const lines = row.wrap ? wrapValueLines(row.value, valueWidth) : [fitText(ctx, row.value, valueWidth)];
      const minHeight = Math.max(Math.round(summaryHeaderSize * 1.55), Math.round(summaryRowSize * 1.65));
      const wrappedHeight = Math.round(summaryRowSize * 0.9) + (lines.length * tableValueLineHeight);
      const rowHeight = row.wrap ? Math.max(minHeight, wrappedHeight) : minHeight;
      return { ...row, lines, rowHeight };
    });

    const tableBottom = tableTop + tableRowLayouts.reduce((sum, row) => sum + row.rowHeight, 0);
    const summarySectionStartY = tableBottom + Math.round(summaryHeaderSize * 1.45);
    const summaryAvailableHeight = Math.max(0, lineY - summarySectionStartY - Math.round(finalHeight * 0.015));
    const maxRows = Math.max(0, Math.floor((summaryAvailableHeight - Math.round(summaryHeaderSize * 1.8)) / summaryRowHeight));

    ctx.strokeStyle = "rgba(71, 85, 105, 0.65)";
    ctx.lineWidth = Math.max(1, Math.round(finalHeight * 0.0011));
    ctx.beginPath();
    ctx.moveTo(tableLeft, tableTop);
    ctx.lineTo(tableLeft + tableWidth, tableTop);
    let rowBoundaryY = tableTop;
    tableRowLayouts.forEach((row) => {
      rowBoundaryY += row.rowHeight;
      ctx.moveTo(tableLeft, rowBoundaryY);
      ctx.lineTo(tableLeft + tableWidth, rowBoundaryY);
    });
    ctx.moveTo(tableSplitX, tableTop);
    ctx.lineTo(tableSplitX, tableBottom);
    ctx.stroke();

    let rowTop = tableTop;
    tableRowLayouts.forEach((row) => {
      const labelY = rowTop + Math.round(Math.min(row.rowHeight * 0.66, summaryHeaderSize * 1.95));
      ctx.textAlign = "left";
      ctx.fillStyle = "#475569";
      ctx.font = `700 ${summaryHeaderSize}px ${EXPORT_BRAND_FONT}`;
      ctx.fillText(`${row.label} :`, tableLeft + Math.round(finalWidth * 0.002), labelY);

      ctx.fillStyle = row.color;
      ctx.font = `600 ${summaryRowSize}px ${EXPORT_BRAND_FONT}`;
      const valueStartX = tableSplitX + Math.round(finalWidth * 0.004);
      const firstLineY = rowTop + Math.round(summaryRowSize * 1.15);
      row.lines.forEach((lineText, lineIndex) => {
        ctx.fillText(lineText, valueStartX, firstLineY + (lineIndex * tableValueLineHeight));
      });
      rowTop += row.rowHeight;
    });

    if (maxRows > 0 && corporateTitleSummary.length > 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = `700 ${summaryHeaderSize}px ${EXPORT_BRAND_FONT}`;
      ctx.fillText("Corporate Title Summary", textX, summarySectionStartY);

      const rows = corporateTitleSummary.slice(0, maxRows);
      const summaryTitleMaxWidth = Math.max(40, summaryWidth - Math.round(finalWidth * 0.028));
      rows.forEach((row, idx) => {
        const y = summarySectionStartY + Math.round(summaryHeaderSize * 1.5) + (idx * summaryRowHeight);
        ctx.fillStyle = "#475569";
        ctx.font = `600 ${summaryRowSize}px ${EXPORT_BRAND_FONT}`;
        ctx.fillText(fitText(ctx, row.title, summaryTitleMaxWidth), textX, y);

        ctx.textAlign = "right";
        ctx.fillStyle = "#334155";
        ctx.fillText(String(row.total), summaryValueX, y);
        ctx.textAlign = "left";
      });
    }

    const lineStartX = brandLeftX;
    const lineEndX = finalWidth - sidePadding - logoBottomWidth - Math.round(finalWidth * 0.03);
    ctx.strokeStyle = "#4F4F4F";
    ctx.lineWidth = Math.max(4, Math.round(finalHeight * 0.0045));
    ctx.beginPath();
    ctx.moveTo(lineStartX, lineY);
    ctx.lineTo(lineEndX, lineY);
    ctx.stroke();
  };

  const captureExportCanvas = async (container, type) => {
    const TARGET_WIDTH = 3840;
    const TARGET_HEIGHT = 2160;

    const restoreWrappedLayout = applyExportWrap(container);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const nodeCount = container.querySelectorAll(".org-node").length;
      const contentBounds = getTreeContentBounds(container);

      const captureX = Math.max(0, Math.floor(contentBounds.x));
      const captureY = Math.max(0, Math.floor(contentBounds.y));
      const captureWidth = Math.max(1, Math.ceil(contentBounds.width));
      const captureHeight = Math.max(1, Math.ceil(contentBounds.height));
      const captureArea = Math.max(1, captureWidth * captureHeight);

      const fitScaleWidth = TARGET_WIDTH / captureWidth;
      const fitScaleHeight = TARGET_HEIGHT / captureHeight;
      const desiredScale = Math.min(4.2, Math.max(2.2, Math.min(fitScaleWidth, fitScaleHeight) * 1.2));

      const maxCapturePixels = nodeCount > 170 ? 42_000_000 : 54_000_000;
      const scaleCapByArea = Math.sqrt(maxCapturePixels / captureArea);
      const boundedScale = Math.max(1.25, Math.min(desiredScale, scaleCapByArea));

      const canvas = await html2canvas(container, {
        scale: boundedScale,
        useCORS: window.location.protocol !== "file:",
        backgroundColor: "#f8fafc",
        logging: false,
        x: captureX,
        y: captureY,
        width: captureWidth,
        height: captureHeight,
        windowWidth: container.scrollWidth,
        windowHeight: container.scrollHeight,
        onclone: (clonedDoc) => {
          // Enable export-only CSS rules (no impact on live UI)
          clonedDoc.body.classList.add(EXPORT_MODE_CLASS);

        const clonedTree = clonedDoc.querySelector(".org-tree");
        if (clonedTree) {
          clonedTree.style.transform = "none";
          clonedTree.style.padding = "0px";
          clonedTree.style.margin = "0px";
        }

        const clonedViewport = clonedDoc.querySelector(".org-export-viewport");
        if (clonedViewport) {
          clonedViewport.style.transform = "none";
          clonedViewport.style.transformOrigin = "top center";
          clonedViewport.style.padding = "0px";
          clonedViewport.style.margin = "0px";
        }

        // Tight spacing for export
        clonedDoc.querySelectorAll(".org-level").forEach((level) => {
          level.style.gap = "0.65rem";
        });
        clonedDoc.querySelectorAll(".org-level-wrap").forEach((wrap) => {
          wrap.style.gap = "0.55rem 0.75rem";
          wrap.style.width = "auto";
          wrap.style.maxWidth = "3000px";
          wrap.style.justifyContent = "center";

        });

        // --- GROUP export: force wrap when a level is too wide ---
        clonedDoc.querySelectorAll(".org-level").forEach((level) => {
          const childNodes = level.querySelectorAll(":scope > .org-node").length;

          // ถ้าแถวนั้นมีหลายการ์ด จะยาวมาก ทำให้ fit ลง 16:9 แล้วเล็ก
          if (childNodes >= 7) {
            level.style.flexWrap = "wrap";
            level.style.justifyContent = "center";
            level.style.gap = "0.55rem";
            level.style.display = "flex";
            level.style.width = "3000px";
            level.style.maxWidth = "3000px"; // คุมให้มัน wrap
            level.style.marginLeft = "auto";
            level.style.marginRight = "auto";
          }
        });
        clonedDoc.querySelectorAll(".org-level-wrap + .org-level-wrap").forEach((el) => {
          el.style.marginTop = "0.55rem";
        });

        // Freeze animations
        clonedDoc.querySelectorAll(".animate-in").forEach((card) => {
          card.style.opacity = "1";
          card.style.transform = "none";
          card.style.animation = "none";
          card.style.visibility = "visible";
          card.style.filter = "none";
        });

        // Remove accidental blank nodes
        const clonedNodes = Array.from(clonedDoc.querySelectorAll(".org-node"));
        clonedNodes.forEach((node) => {
          const card = node.firstElementChild;
          if (!card || !(card instanceof HTMLElement)) {
            node.remove();
            return;
          }
          const nameText = card.querySelector("h3")?.textContent?.trim() || "";
          const positionText = card.querySelector("p")?.textContent?.trim() || "";
          const isCardTooSmall = (card.offsetWidth || 0) < 60 || (card.offsetHeight || 0) < 60;
          if ((!nameText && !positionText) || isCardTooSmall) {
            node.remove();
            return;
          }
          card.style.backgroundColor = "#ffffff";
          card.style.opacity = "1";
          card.style.visibility = "visible";
          card.style.filter = "none";
          card.style.backdropFilter = "none";
          card.style.webkitBackdropFilter = "none";
          card.style.boxShadow = "none";
          card.style.borderColor = "#cbd5e1";
          card.style.borderWidth = "1px";
          card.style.transition = "none";
        });

        // Baseline alignment fixes
        clonedDoc.querySelectorAll(".export-avatar, .export-modal-avatar").forEach((avatar) => {
          avatar.style.display = "flex";
          avatar.style.alignItems = "center";
          avatar.style.justifyContent = "center";
        });

        clonedDoc.querySelectorAll(".export-avatar-text").forEach((t) => {
          t.style.display = "block";
          t.style.lineHeight = "1";
          t.style.transform = "translateY(-1px)";
          if (!((t.textContent || "").trim()) || (t.textContent || "").trim() === "-") {
            t.parentElement?.style.setProperty("display", "none");
          }
        });

        clonedDoc.querySelectorAll(".export-org-badge").forEach((badge) => {
          badge.style.display = "inline-flex";
          badge.style.alignItems = "center";
          badge.style.justifyContent = "center";
          badge.style.lineHeight = "1";
        });

        clonedDoc.querySelectorAll(".export-org-badge-text").forEach((t) => {
          t.style.display = "block";
          t.style.lineHeight = "1";
          t.style.transform = "translateY(-1px)";
          if (!((t.textContent || "").trim()) || (t.textContent || "").trim() === "-") {
            t.parentElement?.style.setProperty("display", "none");
          }
        });
        }
      });

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = TARGET_WIDTH;
      finalCanvas.height = TARGET_HEIGHT;

      const ctx = finalCanvas.getContext("2d");
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      await drawCiOverlay(ctx, TARGET_WIDTH, TARGET_HEIGHT, "background");

      // 16:9 fixed frame, single-page only (tighter margins => larger chart)
      const marginSide = Math.round(TARGET_WIDTH * 0.004);
      const SAFE_BOTTOM = Math.round(TARGET_HEIGHT * 0.20); // กันชนโลโก้/เส้นล่าง
      const marginTop = Math.round(TARGET_HEIGHT * 0.045);
      const reserveLeft = 0;
      const reserveRight = Math.round(TARGET_WIDTH * 0.006);
      const drawAreaX = marginSide + reserveLeft;
      const drawAreaY = marginTop;
      const drawAreaWidth = Math.max(1, TARGET_WIDTH - drawAreaX - marginSide - reserveRight);
      const drawAreaHeight = Math.max(1, (TARGET_HEIGHT - SAFE_BOTTOM) - drawAreaY);

      const fitDrawScale = Math.min(drawAreaWidth / canvas.width, drawAreaHeight / canvas.height);

      let drawWidth = canvas.width * fitDrawScale;
      let drawHeight = canvas.height * fitDrawScale;

      const fillBoost = type === "pdf"
        ? (nodeCount > 140 ? 1.22 : 1.32)
        : (nodeCount > 140 ? 1.24 : 1.36);

      drawWidth *= fillBoost;
      drawHeight *= fillBoost;

      if (drawWidth > drawAreaWidth || drawHeight > drawAreaHeight) {
        const clampScale = Math.min(drawAreaWidth / drawWidth, drawAreaHeight / drawHeight);
        drawWidth *= clampScale;
        drawHeight *= clampScale;
      }

      const offsetX = drawAreaX + ((drawAreaWidth - drawWidth) / 2);
      const offsetY = (drawAreaY + drawAreaHeight) - drawHeight;

      ctx.drawImage(canvas, offsetX, offsetY, drawWidth, drawHeight);

      await drawCiOverlay(ctx, TARGET_WIDTH, TARGET_HEIGHT, "foreground");

      // Free large intermediate buffer after composition.
      canvas.width = 1;
      canvas.height = 1;

      return { finalCanvas, finalWidth: TARGET_WIDTH, finalHeight: TARGET_HEIGHT };
    } finally {
      restoreWrappedLayout();
    }
  };

  const handleExport = async (type) => {
    const container = document.querySelector(".org-tree");
    if (!container || treeData.length === 0 || exportingType) return;
    setExportingType(type);

    try {
      const { finalCanvas, finalWidth, finalHeight } = await withExportMode(() =>
        captureExportCanvas(container, type)
      );

      const timestamp = new Date().getTime();
      assertCanvasExportSafe(finalCanvas);

      if (type === "png") {
        const filename = `CardX_Full_OrgChart_${timestamp}.png`;
        const pngDataUrl = finalCanvas.toDataURL("image/png");
        const savedByWails = await saveExportThroughWails(filename, "png", pngDataUrl);

        if (!savedByWails) {
          const pngBlob = await canvasToBlob(finalCanvas, "image/png");
          const objectUrl = URL.createObjectURL(pngBlob);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = filename;
          link.click();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        }

        finalCanvas.width = 1;
        finalCanvas.height = 1;
      } else {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "px",
          format: [finalWidth, finalHeight],
          compress: false,
          putOnlyUsedFonts: true
        });

        // Use JPEG for PDF embedding first because some jsPDF+PNG paths can drop
        // portions of large canvases in packaged desktop runtimes.
        try {
          const jpegDataUrl = finalCanvas.toDataURL("image/jpeg", 0.98);
          pdf.addImage(jpegDataUrl, "JPEG", 0, 0, finalWidth, finalHeight, undefined, "FAST");
        } catch (jpegError) {
          console.warn("PDF JPEG embed fallback to PNG:", jpegError?.message || jpegError);
          pdf.addImage(finalCanvas, "PNG", 0, 0, finalWidth, finalHeight);
        }

        const filename = `CardX_Full_OrgChart_${timestamp}.pdf`;
        const pdfDataUrl = pdf.output("datauristring");

        const savedByWails = await saveExportThroughWails(filename, "pdf", pdfDataUrl);
        if (!savedByWails) {
          pdf.save(filename);
        }

        finalCanvas.width = 1;
        finalCanvas.height = 1;
      }
    } catch (error) {
      console.error("Export Error:", error);
      alert("Export failed: " + error.message);
    } finally {
      setExportingType(null);
    }
  };

  return {
    exportingType,
    handleExport
  };
}

export default useOrgChartExport;
