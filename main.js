

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


ipcMain.handle('select-input-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});


ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});


ipcMain.handle('process-pdf', async (event, inputPath, outputFolder) => {
  try {
    
    const inputFileName = path.basename(inputPath);
    const inputFileNameWithoutExt = path.parse(inputFileName).name;
    const outputPath = path.join(outputFolder, `${inputFileNameWithoutExt}_output.pdf`);
    
    await cutAndStackPDF(inputPath, outputPath);
    return { success: true, message: `PDF traité avec succès : ${outputPath}` };
  } catch (error) {
    return { success: false, message: `Erreur: ${error.message}` };
  }
});


async function cutAndStackPDF(inputPath, outputPath) {
  const existingPdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const outputPdf = await PDFDocument.create();
  const totalPages = pdfDoc.getPageCount();
  const pagesPerSheet = 4;
  const groups = Math.ceil(totalPages / pagesPerSheet);
  
  for (let group = 0; group < groups; group++) {
    const newPage = outputPdf.addPage([842, 595]); // A4 paysage
    const { width, height } = newPage.getSize();
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    for (let pos = 0; pos < pagesPerSheet; pos++) {
      const idx = group + pos * groups;
      if (idx >= totalPages) continue;
      
      const [copiedPage] = await outputPdf.copyPages(pdfDoc, [idx]);
      const embeddedPage = await outputPdf.embedPage(copiedPage); 
      const scaledWidth = embeddedPage.width;
      const scaledHeight = embeddedPage.height;
      const x = (pos % 2) * halfWidth;
      const y = pos < 2 ? halfHeight : 0;
      
      newPage.drawPage(embeddedPage, {
        x: x + (halfWidth - scaledWidth),
        y: y + (halfHeight - scaledHeight),
        width: scaledWidth,
        height: scaledHeight,
      });
    }
  }
  
  const pdfBytes = await outputPdf.save();
  fs.writeFileSync(outputPath, pdfBytes);
  return outputPath;
}