#pragma once
#include <rtc/rtc.hpp>
#include <iostream>
#include <memory>
#include <functional>
#include "../libs/json/json.hpp"

using json = nlohmann::json;

class RTCManager{
    public:
        RTCManager(int playerId,std::function<void(std::string)> sendWsMsg) : id(playerId), sendSignalingMessage(sendWsMsg){
            rtc::Configuration config;
            config.iceServers.emplace_back("stun:stun.l.google.com:19302");
            config.iceServers.emplace_back("turn:openrelay.metered.ca:80", "openrelay", "openrelay");


            peerConnection = std::make_shared<rtc::PeerConnection>(config);

            peerConnection->onLocalDescription([this](rtc::Description description) {
                std::cout << "[RTCManager] Local Description generate hua";
                json msg = {{"type", description.typeString()}, {"sdp", std::string(description)}};
                sendSignalingMessage(msg.dump());
            });

            peerConnection->onLocalCandidate([this](rtc::Candidate candidate) {
                std::cout << "Naya ICE Candidate mila!\n";
                json msg = {{"type", "candidate"}, {"candidate", std::string(candidate)}, {"mid", candidate.mid()}};
                sendSignalingMessage(msg.dump());
            });
            peerConnection->onDataChannel([this](std::shared_ptr<rtc::DataChannel> dc) {
                std::cout << "🚀 [WebRTC] UDP DATA CHANNEL OPEN for Player " << id << "!\n";
                dataChannel = dc;
            
                // Jab UDP se message aayega
                 dc->onMessage([](std::variant<rtc::binary, rtc::string> data) {
                    if (std::holds_alternative<rtc::binary>(data)) {
                        auto binaryData = std::get<rtc::binary>(data);
                        uint8_t* rawData = reinterpret_cast<uint8_t*>(binaryData.data());
                        
                        if (binaryData.size() >= 13 && rawData[0] == 2) {
                            uint32_t playerId = *reinterpret_cast<uint32_t*>(rawData + 1);
                            float angle = *reinterpret_cast<float*>(rawData + 5);
                            float power = *reinterpret_cast<float*>(rawData + 9);
                            
                            std::cout << "🏏 UDP FAST MESSAGE: Player " << playerId 
                                      << " ne Bat Ghumaya! Angle: " << angle 
                                      << " Power: " << power << "\n";
                        }
                    }
                });
            });

            peerConnection->onStateChange([this](rtc::PeerConnection::State state) {
                std::cout << "WebRTC State: " << state << "\n";
            });
        }
        ~RTCManager() {
        if (peerConnection) peerConnection->close();
    }
    int id;
    std::shared_ptr<rtc::PeerConnection> peerConnection;
    std::function<void(std::string)> sendSignalingMessage;
    std::shared_ptr<rtc::DataChannel> dataChannel;


};