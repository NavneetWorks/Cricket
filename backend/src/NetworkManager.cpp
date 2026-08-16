#include "NetworkManager.h"
#include <cstdint>

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