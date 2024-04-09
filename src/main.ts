import { App, MarkdownRenderer, MarkdownView, Modal, Plugin, TFile } from 'obsidian';
import { hasUncaughtExceptionCaptureCallback } from 'process';
import { PomoSettingTab, PomoSettings, DEFAULT_SETTINGS } from './settings';
import { getDailyNoteFile, Mode, Timer } from './timer';

class NumberInputModal extends Modal {
	timer: Timer;
	hasEntered: boolean = false;
	checklistFile: string;
	constructor(app: App, timer: Timer, checklistFile: string = null) {
		super(app);
		this.timer = timer;
		this.checklistFile = checklistFile;
	}

	async onOpen() {
		let { contentEl } = this;

		const file = this.app.vault.getAbstractFileByPath(this.checklistFile)
		console.log(this.checklistFile);
		console.log(file);
		if (file && file instanceof TFile) {
			const filecontent = await this.app.vault.read(file);
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

			await MarkdownRenderer.renderMarkdown(filecontent, contentEl, this.app.workspace.getActiveFile().path, activeView);
		}

		contentEl.createEl('h2', { text: 'Set timer length' });

		let input = contentEl.createEl('input');
		input.type = 'number';
		input.value = this.timer.settings.pomo.toString();
		input.select();

		let button = contentEl.createEl('button', { text: 'Set' });
		button.onClickEvent(async () => {
			this.timer.startCustomTimer(parseInt(input.value));
			this.close();
		});

		input.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter') {
				this.hasEntered = true;
			}
		});
		input.addEventListener('keyup', (event: KeyboardEvent) => {
			if (event.key === 'Enter' && this.hasEntered) {
				button.click();
			}
		});
	}

	onClose(): void {
		let { contentEl } = this;
		contentEl.empty();
	}
}


export default class PomoTimerPlugin extends Plugin {
	settings: PomoSettings;
	statusBar: HTMLElement;
	timer: Timer;

	async onload() {
		console.log('Loading status bar pomodoro timer');

		await this.loadSettings();
		this.addSettingTab(new PomoSettingTab(this.app, this));

		this.statusBar = this.addStatusBarItem();
		this.statusBar.addClass("statusbar-pomo");
		if (this.settings.logging === true) {
			this.openLogFileOnClick();
		}

		this.timer = new Timer(this);

		/*Adds icon to the left side bar which starts the pomo timer when clicked
		  if no timer is currently running, and otherwise quits current timer*/
		if (this.settings.ribbonIcon === true) {
			this.addRibbonIcon('clock', 'Start pomodoro', async () => {
				this.timer.onRibbonIconClick();
			});
		}

		/*Update status bar timer ever half second
		  Ideally should change so only updating when in timer mode
		  - regular conditional doesn't remove after quit, need unload*/
		this.registerInterval(window.setInterval(async () =>
			this.statusBar.setText(await this.timer.setStatusBarText()), 500));

		console.log("Registering events with modify");
		this.registerEvent(
			this.app.vault.on('modify', async (file) => {
				if (file instanceof TFile)
					this.timer.onFileModify(file);
				}));


		this.addCommand({
			id: 'start-satusbar-pomo',
			name: 'Start pomodoro',
			icon: 'play',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf) {
					if (!checking) {
						this.timer.startTimer(Mode.Pomo);
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'start-custom-pomo',
			name: 'Start custom timer',
			icon: 'play',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf) {
					if (!checking) {
						new NumberInputModal(this.app, this.timer, this.settings.checklistFile).open();
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'pause-satusbar-pomo',
			name: 'Toggle timer pause',
			icon: 'pause',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf && this.timer.mode !== Mode.NoTimer) {
					if (!checking) {
						this.timer.togglePause();
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'quit-satusbar-pomo',
			name: 'Quit timer',
			icon: 'quit',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf && this.timer.mode !== Mode.NoTimer) {
					if (!checking) {
						this.timer.quitTimer();
					}
					return true;
				}
				return false;
			}
		});
	}


	//on click, open log file; from Day Planner https://github.com/lynchjames/obsidian-day-planner/blob/c8d4d33af294bde4586a943463e8042c0f6a3a2d/src/status-bar.ts#L53
	openLogFileOnClick() {
		this.statusBar.addClass("statusbar-pomo-logging");

		this.statusBar.onClickEvent(async (ev: any) => {
			if (this.settings.logging === true) { //this is hacky, ideally I'd just unwatch the onClickEvent as soon as I turned logging off
				try {
					var file: string;
					if (this.settings.logToDaily === true) {
						file = (await getDailyNoteFile()).path;
					} else {
						file = this.settings.logFile;
					}

					this.app.workspace.openLinkText(file, '', false);
				} catch (error) {
					console.log(error);
				}
			}
		});
	}

	onunload() {
		this.timer.quitTimer();
		console.log('Unloading status bar pomodoro timer');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
