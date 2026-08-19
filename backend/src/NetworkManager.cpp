#include "NetworkManager.h"
#include <cstdint>
#include <cstring>
#include "../libs/json/json.hpp" 
using json = nlohmann::json;

NetworkManager::NetworkManager() {}

NetworkManager::~NetworkManager() {
    stop();
}

void NetworkManager::start(int port) {
    std::cout << "[NetworkManager] Starting on port " << port << "...\n";
    networkThread = std::thread(&NetworkManager::runServer, this, port);
}

void NetworkManager::stop() {
    if (networkThread.joinable()) {
        networkThread.join();
    }
}

void NetworkManager::runServer(int port) {
    
    uWS::App().ws<int>("/*", { 
        .open = [this](auto *ws) {
            Player* newPlayer = new Player(nextPlayerId++);
            auto* loop = uWS::Loop::get();
            auto sendSignaling = [ws,loop](std::string msg){
                std::string outMsg = "\x63" + msg;
                 loop->defer([ws, outMsg]() {
                    ws->send(outMsg, uWS::OpCode::BINARY);
                });
            };
            newPlayer->rtc = std::make_shared<RTCManager>(newPlayer->playerId, sendSignaling);
            connectedPlayers[ws] = newPlayer;
            std::cout << "🌐 Naya Player Connect Hua! Total Players : " << connectedPlayers.size() << "\n";
        },

        .message = [this](auto *ws, std::string_view message, uWS::OpCode opCode) {
            try{
               if(opCode != uWS::OpCode::BINARY){
                std::cout << "Received non-binary message, ignoring.\n";
                return; 
               }
               if(message.length() < 1){
                std::cout << "Received message too short, ignoring.\n";
                return; 
               }
               const char* data = message.data();
               uint8_t messageType = data[0];
               Player* p = connectedPlayers[ws];
               if(messageType == 1){// 1 = Player join
                 std::cout << "player Id " << p->playerId << " joined game\n";
               }
               else if(messageType == 2){//2 = batswing
                    if(message.length() < 9){
                        std::cout << "Received batswing message too short, ignoring.\n";
                        return; 
                    }
                    float angle , power;
                    std::memcpy(&angle,data + 1,sizeof(float));
                    std::memcpy(&power,data + 5,sizeof(float));

                    std::cout << "🦇 Player ID " << p->playerId << " ne BAT Ghumaya!\n";
                    std::cout << "   -> Angle: " << angle << " degree\n";
                    std::cout << "   -> Power: " << power << " %\n";
               }
               else if(messageType == 99){
                    std::string jsonStr(data+1,message.length()-1);
                    try{
                        json signalingData = json::parse(jsonStr);
                        std::string type = signalingData["type"];

                        std::cout << "🌐 [Signaling] Player ID " << p->playerId
                              << " ne SDP bheja: " << signalingData["type"] << "\n";

                        if (type == "offer") {
                            // 1. Browser (JS) se aayi hui chithi (Text/String) ko C++ ki bhasha me convert karna.
                            rtc::Description desc(signalingData["sdp"].get<std::string>(), "offer");
                            
                            // 2. C++ engine ko bolna: "Is invitation ko accept kar lo!"
                            p->rtc->peerConnection->setRemoteDescription(desc);
                        }else if (type == "candidate") {
                            // 1. Browser dwara bheje gaye IP Address (Candidate) ko C++ format me badalna.
                            rtc::Candidate cand(signalingData["candidate"].get<std::string>(), signalingData["mid"].get<std::string>());
                            
                            // 2. C++ engine ki address book me ye naya IP add kar dena.
                            p->rtc->peerConnection->addRemoteCandidate(cand);
                        }
                    }catch(const std::exception& e){
                         std::cout << "❌ [Signaling] Error: messagetyp == 99 galat hai!\n";

                    }
               }
            } catch (const std::exception& e) {
                std::cerr << "Error parsing JSON: " << e.what() << "\n";
            }
        },

        .close = [](auto *ws, int code, std::string_view message) {
            std::cout << "❌ Player Disconnect Ho Gaya!\n";
        }
    }).listen(port, [port](auto *listen_socket) {
        if (listen_socket) {
            std::cout << "[NetworkManager] Successfully listening on port " << port << "!\n";
        } else {
            std::cout << "[NetworkManager] ERROR: Port " << port << " par listen fail ho gaya!\n";
        }
    }).run(); 
}