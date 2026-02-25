# Third Party Patch Feed

A real-time dashboard for monitoring security patches and updates from major software vendors. The feed automatically updates every 6 hours to provide the latest security patches.

## Features

- Real-time patch monitoring for 50+ major vendors
- Categorized view by vendor type
- Date range filtering
- Severity-based color coding
- Vendor-specific branding
- Automatic updates every 6 hours
- Mobile-responsive design

## Supported Vendors

### Operating Systems & Core Infrastructure
- Microsoft Windows
- Apple macOS/iOS
- Red Hat Enterprise Linux
- Ubuntu
- SUSE Linux
- Oracle Linux
- CentOS
- VMware
- Citrix Hypervisor
- Proxmox

### Browsers & Communication
- Google Chrome
- Mozilla Firefox
- Microsoft Edge
- Safari
- Zoom
- Slack
- Microsoft Teams
- Cisco Webex
- Discord
- Signal

### Enterprise Software
- Oracle Database
- SAP
- Salesforce
- Microsoft SQL Server
- PostgreSQL
- MySQL/MariaDB
- MongoDB
- Atlassian
- ServiceNow
- Workday

### Security & Infrastructure
- Cisco IOS
- Fortinet FortiOS
- Palo Alto PAN-OS
- Check Point GAiA
- Juniper Junos
- F5 BIG-IP
- SonicWall
- Sophos
- McAfee/Trellix
- Symantec/Norton

### Development & Creative Tools
- Adobe Creative Suite
- JetBrains IDEs
- Visual Studio
- GitLab
- GitHub Enterprise

### Cloud Services
- AWS
- Microsoft Azure
- Google Cloud Platform
- IBM Cloud
- Oracle Cloud

## Setup

1. Clone the repository:
```bash
git clone https://github.com/Toreburn/patch-feed.git
cd patch-feed
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open http://localhost:8000 in your browser

## Deployment

The site is automatically deployed to GitHub Pages. Each push to the main branch triggers a deployment.

The GitHub Actions workflow:
1. Fetches the latest patch data every 6 hours
2. Commits the updated data to the repository
3. Deploys the site to GitHub Pages

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
