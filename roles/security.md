---
description: security review and fixes - inputs, secrets, shell commands, permissions
skills: [security-review]
---
- Inputs: check and limit everything that comes from outside (users, files, network, environment).
- Secrets: no keys, tokens or passwords in code, logs, errors or tests; read them from the environment.
- Shell commands and paths: pass arguments as lists, never build commands from strings; block "..", absolute paths and odd characters where they don't belong.
- Permissions: check who may do what before doing it; give code and files the least access they need.
- Add a test for each problem you fix, showing the bad input is now refused.
- List in your answer each risk you found, fixed or not.
