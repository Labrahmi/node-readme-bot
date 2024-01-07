const express = require('express');
const { exec } = require('child_process');
const simpleGit = require('simple-git');
const { promisify } = require('util');
const crypto = require('crypto');
const directoryTree = require('directory-tree');
const fs = require('fs');
const path = require('path');


const root_repos = 'root';
const PORT = process.env.PORT || 80;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


function generateRepoNameWithHash(repoUrl) {
    const repoName = repoUrl.split('/').pop().replace('.git', '');
    const randomHash = crypto.randomBytes(3).toString('hex');
    const repoNameWithHash = `${repoName}_${randomHash}`;
    return repoNameWithHash;
}

function filterHidden(tree) {
    if (tree.children && tree.children.length > 0) {
        tree.children = tree.children.filter(node => !node.name.startsWith('.'));
        tree.children.forEach(child => filterHidden(child));
    }
}

function get_doc_child(localPath) {
    const tree = directoryTree(localPath);
    filterHidden(tree);
    return tree.children;
}

function isBinaryFile(filePath) {
    try {
        const binaryExtensions = JSON.parse(fs.readFileSync('binaryExtensions.json')).binaryExtensions;
        const fileName = filePath.split('/').pop(); // Extracts the file name
        const fileExtension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
        if (fileName == 'Makefile')
            return false;
        if (!fileExtension) {
            return true;
        }
        return binaryExtensions.includes(`.${fileExtension}`);
    } catch (error) {
        return true; // Treat errors (e.g., unable to read file or JSON) as binary
    }
}

function truncateContent(obj, maxLength) {
    if (obj.content) {
        // Check if content length exceeds maxLength
        if (obj.content.length > maxLength) {
            // Truncate content
            obj.content = obj.content.substring(0, maxLength);
            obj.content += '...';
        }
    }

    // Recursively process children
    if (obj.children && obj.children.length > 0) {
        obj.children.forEach(child => {
            truncateContent(child, maxLength);
        });
    }
}

function generateFileContentJSON(files) {
    const fileContentArray = [];
    const fileContentArray_names = [];
    let count = 0;

    function processFile(file) {
        if (file.children) {
            const folderContent = [];
            const folderContent_name = [];
            file.children.forEach(child => {
                if (child.children) {
                    processFile(child);
                } else {
                    if (isBinaryFile(child.path)) {
                        folderContent.push({
                            name: child.name,
                            content: 'binary',
                        });
                        folderContent_name.push({
                            name: child.name
                        });
                    } else {
                        count++;
                        const content = fs.readFileSync(child.path, 'utf-8');
                        folderContent.push({
                            name: child.name,
                            content: content,
                        });
                        folderContent_name.push({
                            name: child.name
                        });
                    }
                }
            });
            if (folderContent.length > 0) {
                fileContentArray.push({
                    name: file.name,
                    children: folderContent,
                });
                fileContentArray_names.push({
                    name: file.name,
                    children: folderContent,
                });
            }
        } else {
            if (isBinaryFile(file.path)) {
                fileContentArray.push({
                    name: file.name,
                    content: 'binary',
                });
                fileContentArray_names.push({
                    name: file.name,
                });
            } else {
                count++;
                const content = fs.readFileSync(file.path, 'utf-8');
                fileContentArray.push({
                    name: file.name,
                    content: content,
                });
                fileContentArray_names.push({
                    name: file.name,
                });
            }
        }
    }
    files.forEach(file => {
        processFile(file);
    });
    fileContentArray.forEach(element => {
        truncateContent(element, (20000 / count));
    });
    let double_data = {
        'fileNames': fileContentArray_names,
        'fileContentArray': fileContentArray,
    }
    return double_data;
}

app.post('/clone', async (req, res) => {
    const _repoUrl = req.body.repoUrl;
    if (_repoUrl === undefined)
        return res.status(500).json({ error: 'Non valid repo url' });

    const localPath = path.join(root_repos, generateRepoNameWithHash(_repoUrl));
    const git = simpleGit();

    try {
        git.clone(_repoUrl, localPath, (err, result) => {
            if (err) {
                console.error('Error cloning repository:', err);
                return res.status(500).json({ error: 'Failed to clone repository' });
            }

            try {
                let tree_document_childs = get_doc_child(localPath);
                const fileContentJSON = generateFileContentJSON(tree_document_childs);
                console.log("200 Success!")
                res.status(200).json(fileContentJSON);
            } finally {
                // Delete the cloned folder after finishing with it
                try {
                    fs.rmdirSync(localPath, { recursive: true });
                    console.log('Cloned repository deleted successfully.');
                } catch (deleteError) {
                    console.error('Error deleting cloned repository:', deleteError);
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to clone repository' });
    }
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
