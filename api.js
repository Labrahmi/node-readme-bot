const express = require('express');
const { exec } = require('child_process');
const simpleGit = require('simple-git');
const { promisify } = require('util');
const crypto = require('crypto');
const directoryTree = require('directory-tree');
const fs = require('fs');

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

function generateFileContentJSON(files) {
    const fileContentArray = [];

    function processFile(file) {
        if (file.children) {
            const folderContent = [];
            file.children.forEach(child => {
                if (child.children) {
                    processFile(child); // Recursive call for nested folders
                } else {
                    if (isBinaryFile(child.path)) {
                        // For binary files, set the content as 'binary'
                        folderContent.push({
                            name: child.name,
                            content: 'binary',
                        });
                    } else {
                        // For non-binary files, read the content and add it to the array
                        const content = fs.readFileSync(child.path, 'utf-8');
                        folderContent.push({
                            name: child.name,
                            content: content,
                        });
                    }
                }
            });
            if (folderContent.length > 0) {
                fileContentArray.push({
                    name: file.name,
                    children: folderContent,
                });
            }
        } else {
            if (isBinaryFile(file.path)) {
                // For binary files, set the content as 'binary'
                fileContentArray.push({
                    name: file.name,
                    content: 'binary',
                });
            } else {
                // For non-binary files, read the content and add it to the array
                const content = fs.readFileSync(file.path, 'utf-8');
                fileContentArray.push({
                    name: file.name,
                    content: content,
                });
            }
        }
    }

    files.forEach(file => {
        processFile(file);
    });

    return fileContentArray;
}

app.post('/clone', async (req, res) => {
    const _repoUrl = req.body.repoUrl;
    if (_repoUrl === undefined)
        return res.status(500).json({ error: 'Non valid repo url' });
    const localPath = `${root_repos}/${generateRepoNameWithHash(_repoUrl)}`;
    const git = simpleGit();
    try {
        git.clone(_repoUrl, localPath, (err, result) => {
            if (err) {
                console.error('Error cloning repository:', err);
                return;
            }
            let tree_document_childs = get_doc_child(localPath);
            const fileContentJSON = generateFileContentJSON(tree_document_childs);
            console.log("200 Success!")
            return res.status(200).json(fileContentJSON);
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to clone repository' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
