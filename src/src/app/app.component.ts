import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { audit, interval, startWith, Subscription } from 'rxjs';
import * as signalR from "@microsoft/signalr"
import { Language } from 'src/language';

declare var MediaRecorder: any;
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: [ './app.component.css' ]
})

export class AppComponent implements OnInit, OnDestroy {
  recordAudio!: (() => any);
  recorders!: { [id: string] : any; }; 
  subscription!: Subscription;
  hubConnection: signalR.HubConnection;
  text: string = "";
  targetLanguage: string = "uk";
  type: string = "full";
  language: string = "en";
  translation: string = "";
  languages = [new Language("English", "en"), new Language("Ukrainian", "uk")]
  reload = true;
  selectedTab = 'listen';
  
  constructor(private http: HttpClient) {
    this.hubConnection = new signalR.HubConnectionBuilder().withUrl('https://localhost:7158/transcription').build();
    this.recorders = {}

    this.hubConnection
    .start()
    .then(() => console.log('Connection started'))
    .catch(err => console.log('Error while starting connection: ' + err))

    this.hubConnection.on('broadcastTranscriptionData', (data) => {
      if (this.type === "full"){
        this.text = this.text + " " + data;
      }
      else {
        this.text = data;
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  ngOnInit() {
   this.recordAudio = () => {
      return new Promise(resolve => {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'audio/webm; codecs=opus',
              numberOfAudioChannels: 1,
              audioBitsPerSecond : 48000,
            });
            const audioChunks: any[] | undefined = [];

            mediaRecorder.addEventListener('dataavailable', (event: { data: any; }) => {
              audioChunks.push(event.data)
            });

            const start = () => {
              mediaRecorder.start();
            };

            const stop = () => {
              return new Promise(resolve => {
                mediaRecorder.addEventListener('stop', () => {
                  const audioBlob = new Blob(audioChunks, { 'type' : 'audio/webm; codecs=opus' });
                  const reader = new FileReader();
                  reader.readAsDataURL(audioBlob);
                  reader.addEventListener('load', () => {
                    const base64data =  reader.result;
                    let encoded = base64data!.toString().replace(/^data:(.*,)?/, '');
                    if ((encoded.length % 4) > 0) {
                      encoded += '='.repeat(4 - (encoded.length % 4));
                    }
                    this.hubConnection.invoke('BroadcastTranscriptionData', encoded, this.language);
                  }, false);
                });

                mediaRecorder.stop();
              });
            };

            resolve({ start, stop });
          });
      });
    };
  }

  async startPlay() {
    const source = interval(2000).pipe(startWith(0));
    this.subscription = source.subscribe(async () => {
      var id = this.guidGenerator();
      this.recorders[id] = await this.recordAudio(); 
      this.recorders[id].start();
      setTimeout(async () => {
              await this.recorders[id].stop();
            }, 2000);
    });
  }

  guidGenerator() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
  }

  chooseType(type: string) {
    if (this.type === "segment" && type === "full") {
        this.type = "full";
        this.http.get(`https://localhost:7158/transcription/fullTranscription/${this.hubConnection.connectionId}`).subscribe((data : any) => {
          this.text = data.transcription;
        });
    }
    else if (this.type === "full" && type === "segment"){
      this.text = "";
      this.type = "segment";
    }
  }

  openTab(tabName: string) {
    this.selectedTab = tabName;
  }

  onLanguageChange(event: any) {
    for (const id in this.recorders) {
      this.recorders[id].stop();
      this.subscription.unsubscribe();
      this.text = "";
      setTimeout(() => this.reload = false);
      setTimeout(() => this.reload = true);
      this.hubConnection.stop();
      this.hubConnection = new signalR.HubConnectionBuilder().withUrl('https://localhost:7158/transcription').build();
      this.hubConnection
      .start()
      .then(() => console.log('Connection started'))
      .catch(err => console.log('Error while starting connection: ' + err))
      this.hubConnection.on('broadcastTranscriptionData', (data) => {
        if (this.type === "full"){
          this.text = this.text + " " + data;
        }
        else {
          this.text = data;
        }
      });
    }
  }

  translate() {
    this.http.get(`https://localhost:7158/translation/translate?text=${this.text}&sourceLanguage=${this.language}&targetLanguage=${this.targetLanguage}`).subscribe((data : any) => {
      this.translation = data.translation;
    });
  }

  getTranslateOptions(){   
    var list = this.languages.filter((item) => item.label != this.language)
    this.targetLanguage = list[0].label;
    return list;
  }

  except(element: any, array: any) {
    const index = array.indexOf(element);
    if (index !== -1) {
      array.splice(index, 1);
    }
  }

  stopPlay(){
    for (const id in this.recorders) {
      this.recorders[id].stop();
    }
  }
}
